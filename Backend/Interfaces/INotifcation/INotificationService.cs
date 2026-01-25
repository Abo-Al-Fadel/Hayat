namespace Backend.Services
{
    public interface INotificationService
    {
        Task NotifyMedicineChangeAsync(NotificationAction action, Medicine medicine, AppRole actorRole);
        Task NotifyStockChangeAsync(NotificationAction action, Stock stock, AppRole actorRole);
        Task NotifyOrderCreatedAsync(Order order);

        Task NotifyCategoryChangeAsync(NotificationAction action, Category category);
        Task NotifySupplyOrderCreatedAsync(SupplyOrder supplyOrder);
        Task NotifySupplyOrderStatusChangedAsync(SupplyOrder supplyOrder, SupplyOrderStatusEnum oldStatus, AppRole actorRole);
        
        Task BroadcastStockUpdateAsync(SupplyOrder supplyOrder, List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)> stockChanges);
        Task NotifyLowStockAlertAsync(Medicine medicine, int previousQuantity, int soldQuantity);
        
        Task NotifyMedicineStockUpdatedAsync(int medicineId, string medicineName, int newQuantity, int soldQuantity);
        
        Task NotifyInventoryStockIncreasedAsync(SupplyOrder supplyOrder, List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)> stockChanges);
    }
}