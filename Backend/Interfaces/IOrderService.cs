// Services/IOrderService.cs
using System.Text;

public interface IOrderService
{
    Task<(bool Success, string? Error, Order Order)> CreateOrderAsync(CheckoutDto dto);
    Task<string?> GetInvoiceAsync(int orderId);
    Task<List<object>> GetOrdersAsync();
    Task<(bool Success, string? Error, Order? Order)> RemoveOrderItemAsync(int orderId, int itemId);
    Task<(bool Success, string? Error, Order? Order)> UpdateOrderItemQuantityAsync(int orderId, int itemId, int newQuantity);
    Task<(bool Success, string Message)> CancelOrderAsync(int orderId);
}
