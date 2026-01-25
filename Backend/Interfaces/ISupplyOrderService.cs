using Microsoft.AspNetCore.Mvc;

public interface ISupplyOrderService
{
    Task<SupplyOrderDto> CreateOrderAsync(CreateSupplyOrderDto dto);
    Task<List<SupplyOrderDto>> GetAllAsync();
    Task<SupplyOrderDto?> GetByIdAsync(int id);
    /// <summary>
    /// Update supply order status with real-time notification
    /// </summary>
    /// <param name="id">Supply order ID</param>
    /// <param name="newStatus">New status to set</param>
    /// <param name="actorRole">Role of the user making the change (for notification routing)</param>
    Task<SupplyOrderDto> UpdateStatusAsync(int id, SupplyOrderStatusEnum newStatus, AppRole? actorRole = null);
    Task<SupplyOrderDto> UpdateOrderAsync(int id, UpdateSupplyOrderDto dto);
    Task MarkAsReceivedAsync(int supplyOrderId);
    Task<List<SupplyOrderDto>> GetByStatusAsync(SupplyOrderStatusEnum status);
    Task<List<SupplyOrderDto>> GetActiveOrdersAsync();
    Task<List<SupplyOrderDto>> GetOrdersForStorageManagerAsync();
    Task DeleteOrderAsync(int id);
}
