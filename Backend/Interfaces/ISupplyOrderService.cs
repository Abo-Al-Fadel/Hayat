using Microsoft.AspNetCore.Mvc;

public interface ISupplyOrderService
{
    Task<SupplyOrderDto> CreateOrderAsync(CreateSupplyOrderDto dto);
    Task<List<SupplyOrderDto>> GetAllAsync();
    Task<SupplyOrderDto?> GetByIdAsync(int id);
    Task<SupplyOrderDto> UpdateStatusAsync(int id, SupplyOrderStatusEnum newStatus);
    Task<SupplyOrderDto> UpdateOrderAsync(int id, UpdateSupplyOrderDto dto);
    Task MarkAsReceivedAsync(int supplyOrderId);
    Task<List<SupplyOrderDto>> GetByStatusAsync(SupplyOrderStatusEnum status);
    Task<List<SupplyOrderDto>> GetActiveOrdersAsync(); // Excludes Stored and Cancelled
}
