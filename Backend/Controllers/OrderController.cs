using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
// Authentication only. Do NOT add a role list here: [Authorize] attributes are
// cumulative, so a controller-level role silently narrows every action beneath it.
// Each action states its own policy; this makes a forgotten one fail closed.
[Authorize]
public class OrderController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrderController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    [HttpPost]
    [Authorize(Roles = Roles.CanSell)]
    public async Task<IActionResult> CreateOrder([FromBody] CheckoutDto dto)
    {
        var result = await _orderService.CreateOrderAsync(dto);

        if (!result.Success)
            return BadRequest(result.Error);

        var invoice = await _orderService.GetInvoiceAsync(result.Order.Id);

        return Ok(new
        {
            orderId = result.Order.Id,
            total = result.Order.TotalPrice,
            invoice
        });
    }

    [HttpGet("{id}/invoice")]
    [Authorize(Roles = Roles.CanReadOrders)]
    public async Task<IActionResult> GetInvoice(int id)
    {
        var invoice = await _orderService.GetInvoiceAsync(id);
        if (invoice == null) return NotFound();
        return Ok(invoice);
    }

    [HttpGet]
    [Authorize(Roles = Roles.CanReadOrders)]
    public async Task<IActionResult> GetOrders()
    {
        var orders = await _orderService.GetOrdersAsync();
        return Ok(orders);
    }

    [HttpDelete("{orderId}/item/{itemId}")]
    [Authorize(Roles = Roles.CanSell)]
    public async Task<IActionResult> RemoveOrderItem(int orderId, int itemId)
    {
        var result = await _orderService.RemoveOrderItemAsync(orderId, itemId);
        if (!result.Success) return NotFound(result.Error);

        return Ok(new { orderId = result.Order!.Id, total = result.Order.TotalPrice });
    }

    [HttpPut("{orderId}/item/{itemId}")]
    [Authorize(Roles = Roles.CanSell)]
    public async Task<IActionResult> UpdateOrderItemQuantity(int orderId, int itemId, [FromBody] UpdateOrderItemDto dto)
    {
        var result = await _orderService.UpdateOrderItemQuantityAsync(orderId, itemId, dto.Quantity);
        if (!result.Success) return BadRequest(result.Error);

        return Ok(new { orderId = result.Order!.Id, total = result.Order.TotalPrice });
    }

    [HttpDelete("{orderId}")]
    [Authorize(Roles = Roles.CanSell)]
    public async Task<IActionResult> CancelOrder(int orderId)
    {
        var result = await _orderService.CancelOrderAsync(orderId);
        if (!result.Success)
            return BadRequest(new { message = result.Message });

        return Ok(new { message = result.Message });
    }

}
