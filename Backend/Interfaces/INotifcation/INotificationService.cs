namespace Backend.Services
{
    public interface INotificationService
    {
        Task NotifyMedicineChangeAsync(NotificationAction action, Medicine medicine, AppRole actorRole);
        Task NotifyStockChangeAsync(NotificationAction action, Stock stock, AppRole actorRole);
        Task NotifyOrderCreatedAsync(Order order);
    }
}