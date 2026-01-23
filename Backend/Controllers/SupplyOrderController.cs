using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

/// <summary>
/// Controller for Supply Order operations
/// 
/// Endpoints:
/// POST   /api/SupplyOrder           - Create new order (Admin)
/// GET    /api/SupplyOrder           - Get all orders (Admin, StorageManager)
/// GET    /api/SupplyOrder/active    - Get active orders only (Admin, StorageManager)
/// GET    /api/SupplyOrder/{id}      - Get order by ID (Admin, StorageManager)
/// GET    /api/SupplyOrder/status/{status} - Get by status (Admin, StorageManager)
/// PATCH  /api/SupplyOrder/{id}/status     - Update status (Admin, StorageManager)
/// PUT    /api/SupplyOrder/{id}      - Update order details (Admin, only when Created)
/// </summary>
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

    /// <summary>
    /// Update supply order status (PATCH - partial update)
    /// 
    /// Status Transitions:
    /// - Created → Approved → Ordered (Admin)
    /// - Ordered → Shipped → Received → Stored (StorageManager)
    /// - Cancel allowed before Shipped (Admin)
    /// 
    /// When status becomes "Stored", inventory is automatically updated.
    /// </summary>
    [HttpPatch("{id}/status")]
    [Authorize(Roles = "Admin,StorageManager")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateStatusDto dto)
    {
        if (dto == null || string.IsNullOrEmpty(dto.Status))
            return BadRequest("Status is required");

        // Parse string status to enum
        if (!Enum.TryParse<SupplyOrderStatusEnum>(dto.Status, true, out var newStatus))
            return BadRequest($"Invalid status: {dto.Status}. Valid values: {string.Join(", ", Enum.GetNames<SupplyOrderStatusEnum>())}");

        try
        {
            var updated = await _service.UpdateStatusAsync(id, newStatus);
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

    /// <summary>
    /// Update supply order details (only when status is Created)
    /// </summary>
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
}

/// <summary>
/// DTO for status update request
/// Uses string to allow flexible parsing from frontend
/// </summary>
public class UpdateStatusDto
{
    public string Status { get; set; } = string.Empty;
}
