using Backend.Hubs;
using Backend.Services;
using Hayaa.Backend.Models;
using Microsoft.AspNetCore.SignalR;

public class NotificationService : INotificationService
{
    private readonly PharmacyDbContext _context;
    private readonly IHubContext<NotificationsHub> _hub;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(PharmacyDbContext context, IHubContext<NotificationsHub> hub, ILogger<NotificationService> logger)
    {
        _context = context;
        _hub = hub;
        _logger = logger;
    }

    private AppRole? GetTargetRole(AppRole actorRole, string context)
    {
        return (actorRole, context) switch
        {
            (AppRole.Admin, "Medicine") => AppRole.Pharmacist,
            (AppRole.Pharmacist, "Medicine") => AppRole.Admin,
            (AppRole.Admin, "Stock") => AppRole.StorageManager,
            (AppRole.StorageManager, "Stock") => AppRole.Admin,
            _ => null
        };
    }

    public async Task NotifyMedicineChangeAsync(NotificationAction action, Medicine medicine, AppRole actorRole)
    {
        var targetRole = GetTargetRole(actorRole, "Medicine");
        if (targetRole == null) 
        {
            _logger.LogWarning("[SignalR] No target role for actorRole={Actor}, context=Medicine", actorRole);
            return;
        }

        var message = action switch
        {
            NotificationAction.Created => $"New medicine added: {medicine.Name}",
            NotificationAction.Updated => $"Medicine updated: {medicine.Name}",
            NotificationAction.Deleted => $"Medicine removed: {medicine.Name}",
            _ => $"{action}: {medicine.Name}"
        };

        var notif = new Notification
        {
            TargetRole = targetRole.ToString(),
            Action = action,
            MedicineId = medicine.Id,
            MedicineName = medicine.Name,
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

        // Payload with camelCase property names for frontend JavaScript
        var payload = new
        {
            id = notif.Id,
            medicineId = notif.MedicineId,
            medicineName = notif.MedicineName,
            message = notif.Message,
            action = action.ToString().ToLower(),
            createdAt = notif.CreatedAt,
            timestamp = DateTime.UtcNow
        };

        // Log the broadcast for debugging
        _logger.LogInformation("[SignalR] ============================================");
        _logger.LogInformation("[SignalR] BROADCASTING ReceiveNotification");
        _logger.LogInformation("[SignalR] Target Group: {Role}", targetRole.ToString());
        _logger.LogInformation("[SignalR] Action: {Action}", action.ToString().ToLower());
        _logger.LogInformation("[SignalR] Message: {Message}", message);
        _logger.LogInformation("[SignalR] Payload: {@Payload}", payload);
        _logger.LogInformation("[SignalR] ============================================");

        // Send to role-based group (e.g., "Pharmacist")
        await _hub.Clients.Group(targetRole.ToString())
                          .SendAsync("ReceiveNotification", payload);
    }

    public async Task NotifyStockChangeAsync(NotificationAction action, Stock stock, AppRole actorRole)
    {
        var targetRole = GetTargetRole(actorRole, "Stock");
        if (targetRole == null) return;

        var message = action switch
        {
            NotificationAction.Created => $"New stock added: {stock.Medicine.Name}",
            NotificationAction.Updated => $"Stock updated: {stock.Medicine.Name}",
            NotificationAction.Deleted => $"Stock removed: {stock.Medicine.Name}",
            _ => $"{action}: {stock.Medicine.Name}"
        };

        var notif = new Notification
        {
            TargetRole = targetRole.ToString(),
            Action = action,
            MedicineId = stock.MedicineId,
            MedicineName = stock.Medicine.Name,
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

        // Use lowercase property names for frontend compatibility
        _logger.LogInformation("[SignalR] Broadcasting ReceiveNotification to group '{Role}': {Message}", 
            targetRole.ToString(), message);
            
        await _hub.Clients.Group(targetRole.ToString())
                          .SendAsync("ReceiveNotification", new
                          {
                              id = notif.Id,
                              medicineId = notif.MedicineId,
                              medicineName = notif.MedicineName,
                              message = notif.Message,
                              action = action.ToString().ToLower(),
                              createdAt = notif.CreatedAt,
                              timestamp = DateTime.UtcNow
                          });
    }

    public async Task NotifyOrderCreatedAsync(Order order)
    {
        var message = $"New order #{order.Id} created - Total: ${order.TotalPrice:F2}";

        _logger.LogInformation("[SignalR] ============================================");
        _logger.LogInformation("[SignalR] BROADCASTING OrderCreated to Admin group");
        _logger.LogInformation("[SignalR] Order ID: {OrderId}, Total: {Total}", order.Id, order.TotalPrice);
        _logger.LogInformation("[SignalR] ============================================");

        // Send OrderCreated event to Admin group
        await _hub.Clients.Group("Admin")
                          .SendAsync("OrderCreated", new
                          {
                              orderId = order.Id,
                              totalPrice = order.TotalPrice,
                              itemsCount = order.Items?.Count ?? 0,
                              createdAt = order.CreatedAt,
                              message = message,
                              type = "order",
                              action = "ordercreated"
                          });

        // Also send via ReceiveNotification for backwards compatibility
        await _hub.Clients.Group("Admin")
                          .SendAsync("ReceiveNotification", new
                          {
                              orderId = order.Id,
                              message = message,
                              type = "order",
                              action = "ordercreated",
                              createdAt = order.CreatedAt,
                              timestamp = DateTime.UtcNow
                          });
    }
}