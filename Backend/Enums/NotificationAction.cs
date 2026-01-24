public enum NotificationAction
{
    Created,
    Updated,
    Deleted,
    // Supply Order status change actions
    StatusChanged,
    SupplyOrderCreated,
    SupplyOrderShipped,
    SupplyOrderReceived,
    SupplyOrderStored,
    // Inventory alerts
    LowStockAlert
}
