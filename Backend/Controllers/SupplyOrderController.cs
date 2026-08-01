using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class SupplyOrderController : ControllerBase
{
    private readonly ISupplyOrderService _service;

    public SupplyOrderController(ISupplyOrderService service)
    {
        _service = service;
    }

    // Admin creates supply order
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create([FromBody] CreateSupplyOrderDto dto)
    {
        if (dto == null || dto.Items == null || dto.Items.Count == 0)
            return BadRequest("Invalid supply order data.");

        try
        {
            var createdOrder = await _service.CreateOrderAsync(dto);
            return Ok(createdOrder);
        }
        catch (Exception ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // Get all supply orders
    [HttpGet]
    [Authorize(Roles = "Admin,StorageManager")]
    public async Task<IActionResult> GetAll()
    {
        var orders = await _service.GetAllAsync();
        return Ok(orders);
    }

    // Get active orders only (excludes Stored and Cancelled for performance)
    [HttpGet("active")]
    [Authorize(Roles = "Admin,StorageManager")]
    public async Task<IActionResult> GetActive()
    {
        var orders = await _service.GetActiveOrdersAsync();
        return Ok(orders);
    }

    // Get by ID
    [HttpGet("{id}")]
    [Authorize(Roles = "Admin,StorageManager")]
    public async Task<IActionResult> GetById(int id)
    {
        var order = await _service.GetByIdAsync(id);
        if (order == null)
            return NotFound("Supply order not found");
        return Ok(order);
    }

    // Get by status
    [HttpGet("status/{status}")]
    [Authorize(Roles = "Admin,StorageManager")]
    public async Task<IActionResult> GetByStatus(SupplyOrderStatusEnum status)
    {
        var orders = await _service.GetByStatusAsync(status);
        return Ok(orders);
    }

    // Get orders for Storage Manager (Ordered, Shipped, Received only)
    [HttpGet("storage-manager")]
    [Authorize(Roles = "StorageManager")]
    public async Task<IActionResult> GetForStorageManager()
    {
        var orders = await _service.GetOrdersForStorageManagerAsync();
        return Ok(orders);
    }

    // Update supply order status (PATCH - partial update)
    [HttpPatch("{id}/status")]
    [Authorize(Roles = "Admin,StorageManager")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateStatusDto dto)
    {
        if (dto == null || string.IsNullOrEmpty(dto.Status))
            return BadRequest("Status is required");

        // Parse string status to enum
        if (!Enum.TryParse<SupplyOrderStatusEnum>(dto.Status, true, out var newStatus))
            return BadRequest($"Invalid status: {dto.Status}. Valid values: {string.Join(", ", Enum.GetNames<SupplyOrderStatusEnum>())}");

        // Determine actor role from JWT claims for notification routing
        AppRole? actorRole = null;
        if (User.IsInRole("Admin"))
            actorRole = AppRole.Admin;
        else if (User.IsInRole("StorageManager"))
            actorRole = AppRole.StorageManager;

        try
        {
            var updated = await _service.UpdateStatusAsync(id, newStatus, actorRole);
            return Ok(updated);
        }
        catch (UnauthorizedAccessException ex)
        {
            // This stage of the workflow belongs to the other role.
            return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }

    // Update supply order details (only when status is Created)
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateSupplyOrderDto dto)
    {
        try
        {
            var updated = await _service.UpdateOrderAsync(id, dto);
            return Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }

    // Legacy endpoint - Storage manager marks as received
    [HttpPost("{id}/mark-received")]
    [Authorize(Roles = "StorageManager")]
    public async Task<IActionResult> MarkAsReceived(int id)
    {
        try
        {
            await _service.MarkAsReceivedAsync(id);
            return Ok();
        }
        catch (Exception ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// Delete a supply order (Admin only)
    /// Only allowed for Stored or Cancelled orders
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            await _service.DeleteOrderAsync(id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }
}

public class UpdateStatusDto
{
    public string Status { get; set; } = string.Empty;
}
