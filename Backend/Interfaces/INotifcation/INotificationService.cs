namespace Backend.Services
{
    public interface INotificationService
    {
        Task NotifyMedicineChangeAsync(NotificationAction action, Medicine medicine, AppRole actorRole);
        Task NotifyStockChangeAsync(NotificationAction action, Stock stock, AppRole actorRole);
        Task NotifyOrderCreatedAsync(Order order);
        
        /// <summary>
        /// Notify about supply order changes (status updates, creation)
        /// Admin creates → NotifyStorageManager
        /// StorageManager updates status → NotifyAdmin
        /// TARGET ROLES: Admin, StorageManager ONLY - Pharmacist excluded
        /// </summary>
        Task NotifySupplyOrderCreatedAsync(SupplyOrder supplyOrder);
        Task NotifySupplyOrderStatusChangedAsync(SupplyOrder supplyOrder, SupplyOrderStatusEnum oldStatus, AppRole actorRole);
        
        /// <summary>
        /// INVENTORY UPDATE EVENT - Broadcasts to Admin and StorageManager ONLY
        /// Called when supply order is "Stored" and inventory quantities are updated
        /// Pharmacist is EXCLUDED - they only see medicine price/name changes, not supply logistics
        /// </summary>
        Task BroadcastStockUpdateAsync(SupplyOrder supplyOrder, List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)> stockChanges);
        
        /// <summary>
        /// LOW STOCK ALERT - Notifies Admin ONLY when medicine quantity drops to or below threshold
        /// Triggered after Pharmacist sale, NOT on every quantity change
        /// Only fires on transition: previousQty > threshold AND newQty <= threshold
        /// </summary>
        Task NotifyLowStockAlertAsync(Medicine medicine, int previousQuantity, int soldQuantity);
        
        /// <summary>
        /// SILENT STOCK UPDATE - Broadcasts to Admin ONLY for real-time stock display sync
        /// NO toast, NO notification bell - just state update
        /// Called after every Pharmacist sale to keep Admin product list in sync
        /// </summary>
        Task NotifyMedicineStockUpdatedAsync(int medicineId, string medicineName, int newQuantity, int soldQuantity);
        
        /// <summary>
        /// INVENTORY STOCK INCREASED - Notifies Pharmacist and Admin when supply order is STORED
        /// Shows toast with medicine names and quantities added to inventory
        /// Called from SupplyOrderService when status transitions to STORED
        /// StorageManager is EXCLUDED - they already know (they stored it)
        /// </summary>
        Task NotifyInventoryStockIncreasedAsync(SupplyOrder supplyOrder, List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)> stockChanges);
    }
}