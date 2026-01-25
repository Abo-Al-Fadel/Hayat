using Backend.Hubs;
using Backend.Services;
using Hayaa.Backend.Models;
using Microsoft.AspNetCore.SignalR;

/// <summary>
/// Service for sending real-time notifications via SignalR
/// 
/// Notification Flow:
/// - Medicine changes: Admin ↔ Pharmacist (bidirectional)
/// - Supply Orders: Admin → StorageManager (creation), StorageManager → Admin (status changes)
/// - Orders: Pharmacist → Admin (new orders)
/// </summary>
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
            (AppRole.Admin, "SupplyOrder") => AppRole.StorageManager,
            (AppRole.StorageManager, "SupplyOrder") => AppRole.Admin,
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

        var role = targetRole.Value;
        var message = action switch
        {
            NotificationAction.Created => $"New medicine added: {medicine.Name}",
            NotificationAction.Updated => $"Medicine updated: {medicine.Name}",
            NotificationAction.Deleted => $"Medicine removed: {medicine.Name}",
            _ => $"{action}: {medicine.Name}"
        };

        var notif = new Notification
        {
            TargetRole = role.ToString(),
            Action = action,
            MedicineId = medicine.Id,
            MedicineName = medicine.Name,
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

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

        _logger.LogInformation("[SignalR] Broadcasting ReceiveNotification to {Role}: {Action} {Medicine}", 
            role, action.ToString().ToLower(), medicine.Name);

        await _hub.Clients.Group(role.ToString())
                          .SendAsync("ReceiveNotification", payload);
    }

    public async Task NotifyStockChangeAsync(NotificationAction action, Stock stock, AppRole actorRole)
    {
        var targetRole = GetTargetRole(actorRole, "Stock");
        if (targetRole == null) return;

        var role = targetRole.Value;
        var message = action switch
        {
            NotificationAction.Created => $"New stock added: {stock.Medicine.Name}",
            NotificationAction.Updated => $"Stock updated: {stock.Medicine.Name}",
            NotificationAction.Deleted => $"Stock removed: {stock.Medicine.Name}",
            _ => $"{action}: {stock.Medicine.Name}"
        };

        var notif = new Notification
        {
            TargetRole = role.ToString(),
            Action = action,
            MedicineId = stock.MedicineId,
            MedicineName = stock.Medicine.Name,
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

        _logger.LogInformation("[SignalR] Broadcasting ReceiveNotification to {Role}: {Message}", role, message);
            
        await _hub.Clients.Group(role.ToString())
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

    /// <summary>
    /// DEPRECATED: Admin no longer receives sale notifications.
    /// This method is kept for backwards compatibility but does nothing.
    /// Admin receives ONLY: LowStockAlert, SupplyOrderStatusChanged
    /// Admin receives SILENT: MedicineStockUpdated (no notification, just data sync)
    /// </summary>
    public async Task NotifyOrderCreatedAsync(Order order)
    {
        // INTENTIONALLY EMPTY - Admin should NOT receive sale notifications
        // Admin only cares about:
        // 1. Low stock alerts (when stock drops below threshold)
        // 2. Supply order status changes (from StorageManager)
        // 3. Silent stock updates (for real-time product list sync)
        _logger.LogInformation("[SignalR] OrderCreated SUPPRESSED for Admin - sale notifications disabled");
        _logger.LogInformation("[SignalR] Order ID: {OrderId}, Total: {Total}", order.Id, order.TotalPrice);
        await Task.CompletedTask;
    }

    /// <summary>
    /// Notify Storage Manager when Admin creates a new supply order
    /// This triggers notification bell in Storage Manager dashboard
    /// </summary>
    public async Task NotifySupplyOrderCreatedAsync(SupplyOrder supplyOrder)
    {
        var itemCount = supplyOrder.Items?.Count ?? 0;
        var supplierName = supplyOrder.Supplier?.Name ?? "Unknown";
        var message = $"New supply order #{supplyOrder.Id} from {supplierName} with {itemCount} item(s)";

        var notif = new Notification
        {
            TargetRole = AppRole.StorageManager.ToString(),
            Action = NotificationAction.SupplyOrderCreated,
            SupplyOrderId = supplyOrder.Id,
            SupplyOrderName = $"Order #{supplyOrder.Id}",
            NewStatus = supplyOrder.Status.ToString(),
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

        _logger.LogInformation("[SignalR] Broadcasting SupplyOrderCreated to StorageManager: Order {Id}", supplyOrder.Id);

        var payload = new
        {
            id = notif.Id,
            supplyOrderId = supplyOrder.Id,
            supplierName = supplierName,
            itemCount = itemCount,
            status = supplyOrder.Status.ToString(),
            message = message,
            action = "supplyordercreated",
            type = "supplyorder",
            createdAt = notif.CreatedAt,
            timestamp = DateTime.UtcNow
        };

        // FIX: Send ONLY ONE event - ReceiveNotification (removes duplicate)
        await _hub.Clients.Group("StorageManager")
                          .SendAsync("ReceiveNotification", payload);
    }

    /// <summary>
    /// Notify about supply order status changes
    /// </summary>
    public async Task NotifySupplyOrderStatusChangedAsync(SupplyOrder supplyOrder, SupplyOrderStatusEnum oldStatus, AppRole actorRole)
    {
        var targetRole = GetTargetRole(actorRole, "SupplyOrder");
        if (targetRole == null)
        {
            _logger.LogWarning("[SignalR] No target role for actorRole={Actor}, context=SupplyOrder", actorRole);
            return;
        }

        var role = targetRole.Value;
        var actorName = actorRole == AppRole.StorageManager ? "Storage Manager" : "Admin";
        var message = $"Supply order #{supplyOrder.Id} status changed from '{oldStatus}' to '{supplyOrder.Status}' by {actorName}";

        var notif = new Notification
        {
            TargetRole = role.ToString(),
            Action = NotificationAction.StatusChanged,
            SupplyOrderId = supplyOrder.Id,
            SupplyOrderName = $"Order #{supplyOrder.Id}",
            OldStatus = oldStatus.ToString(),
            NewStatus = supplyOrder.Status.ToString(),
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

        _logger.LogInformation("[SignalR] Broadcasting SupplyOrderStatusChanged to {Role}: Order {Id} {Old} → {New}", 
            role, supplyOrder.Id, oldStatus, supplyOrder.Status);

        var payload = new
        {
            id = notif.Id,
            supplyOrderId = supplyOrder.Id,
            oldStatus = oldStatus.ToString(),
            newStatus = supplyOrder.Status.ToString(),
            message = message,
            action = "supplyorderstatuschanged",
            type = "supplyorder",
            changedBy = actorName,
            createdAt = notif.CreatedAt,
            timestamp = DateTime.UtcNow
        };

        await _hub.Clients.Group(role.ToString())
                          .SendAsync("ReceiveNotification", payload);
    }

    /// <summary>
    /// INVENTORY UPDATE - Broadcasts to Admin and StorageManager ONLY
    /// </summary>
    public async Task BroadcastStockUpdateAsync(SupplyOrder supplyOrder, List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)> stockChanges)
    {
        _logger.LogInformation("[SignalR] Broadcasting StockUpdated: Order {Id}, {Count} items", supplyOrder.Id, stockChanges.Count);

        // Build detailed message with medicine names
        string message;
        if (stockChanges.Count == 1)
        {
            var item = stockChanges[0];
            message = $"Stock updated: {item.MedicineName} (+{item.AddedQuantity} units)";
        }
        else
        {
            var names = string.Join(", ", stockChanges.Take(3).Select(c => c.MedicineName));
            if (stockChanges.Count > 3)
                names += $" and {stockChanges.Count - 3} more";
            var totalAdded = stockChanges.Sum(c => c.AddedQuantity);
            message = $"Stock updated: {stockChanges.Count} medicines added ({names}) - Total: +{totalAdded} units";
        }

        var payload = new
        {
            supplyOrderId = supplyOrder.Id,
            message = message,
            action = "stockupdated",
            type = "stock",
            timestamp = DateTime.UtcNow,
            items = stockChanges.Select(c => new
            {
                medicineId = c.MedicineId,
                medicineName = c.MedicineName,
                newQuantity = c.NewQuantity,
                addedQuantity = c.AddedQuantity
            }).ToList()
        };

        // Send to Admin and StorageManager only
        var roles = new[] { "Admin", "StorageManager" };
        foreach (var role in roles)
        {
            await _hub.Clients.Group(role).SendAsync("StockUpdated", payload);
        }
    }

    /// <summary>
    /// LOW STOCK ALERT - Notifies Admin ONLY when medicine quantity drops to or below threshold
    /// 
    /// Business Rules:
    /// - Triggered ONLY after Pharmacist sale (stock deduction)
    /// - Fires ONLY on transition: previousQty > threshold AND newQty <= threshold
    /// - Does NOT re-fire if already below threshold
    /// - Admin ONLY - Pharmacist does not need to know
    /// </summary>
    public async Task NotifyLowStockAlertAsync(Medicine medicine, int previousQuantity, int soldQuantity)
    {
        // Only alert on transition INTO low stock state
        bool wasAboveThreshold = previousQuantity > medicine.LowStockThreshold;
        bool isNowAtOrBelowThreshold = medicine.Quantity <= medicine.LowStockThreshold;
        
        if (!wasAboveThreshold || !isNowAtOrBelowThreshold)
        {
            _logger.LogDebug("[LowStock] No alert needed for {Medicine}. Previous: {Prev}, Current: {Current}, Threshold: {Threshold}",
                medicine.Name, previousQuantity, medicine.Quantity, medicine.LowStockThreshold);
            return;
        }

        // Message does NOT include threshold value per requirements
        var message = $"⚠️ Low Stock Alert: {medicine.Name} is now at {medicine.Quantity} units";

        // Persist notification for Admin
        var notif = new Notification
        {
            TargetRole = AppRole.Admin.ToString(),
            Action = NotificationAction.LowStockAlert,
            MedicineId = medicine.Id,
            MedicineName = medicine.Name,
            Message = message
        };

        _context.Notifications.Add(notif);
        await _context.SaveChangesAsync();

        _logger.LogWarning("[SignalR] LowStockAlert: {Name}, Qty: {Qty}, Threshold: {Threshold}", 
            medicine.Name, medicine.Quantity, medicine.LowStockThreshold);

        var payload = new
        {
            id = notif.Id,
            medicineId = medicine.Id,
            medicineName = medicine.Name,
            currentQuantity = medicine.Quantity,
            threshold = medicine.LowStockThreshold,
            previousQuantity = previousQuantity,
            soldQuantity = soldQuantity,
            message = message,
            action = "lowstockalert",
            type = "lowstock",
            createdAt = notif.CreatedAt,
            timestamp = DateTime.UtcNow
        };

        await _hub.Clients.Group("Admin").SendAsync("LowStockAlert", payload);
    }

    /// <summary>
    /// SILENT STOCK UPDATE - Admin only for real-time display sync
    /// </summary>
    public async Task NotifyMedicineStockUpdatedAsync(int medicineId, string medicineName, int newQuantity, int soldQuantity)
    {
        _logger.LogInformation("[SignalR] MedicineStockUpdated: {Name}, Qty: {Qty}", medicineName, newQuantity);

        var payload = new
        {
            medicineId = medicineId,
            medicineName = medicineName,
            newStock = newQuantity,
            soldQuantity = soldQuantity,
            changedBy = "Pharmacist",
            timestamp = DateTime.UtcNow
        };

        await _hub.Clients.Group("Admin").SendAsync("MedicineStockUpdated", payload);
    }

    /// <summary>
    /// INVENTORY STOCK INCREASED - Notifies Pharmacist and Admin when supply order is STORED
    /// </summary>
    public async Task NotifyInventoryStockIncreasedAsync(
        SupplyOrder supplyOrder, 
        List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)> stockChanges)
    {
        if (!stockChanges.Any()) return;

        // Build message
        string message;
        int totalAdded = stockChanges.Sum(c => c.AddedQuantity);
        
        if (stockChanges.Count == 1)
        {
            var item = stockChanges[0];
            message = $"📦 Stock Replenished: {item.MedicineName} (+{item.AddedQuantity} units)";
        }
        else if (stockChanges.Count <= 3)
        {
            var names = string.Join(", ", stockChanges.Select(c => c.MedicineName));
            message = $"📦 Stock Replenished: {names} - Total: +{totalAdded} units";
        }
        else
        {
            message = $"📦 Stock Replenished: {stockChanges.Count} medicines - Total: +{totalAdded} units";
        }

        _logger.LogInformation("[SignalR] InventoryStockIncreased: Order {Id}, {Count} items", supplyOrder.Id, stockChanges.Count);

        var payload = new
        {
            supplyOrderId = supplyOrder.Id,
            message = message,
            action = "inventorystockincreased",
            type = "inventory",
            timestamp = DateTime.UtcNow,
            items = stockChanges.Select(c => new
            {
                medicineId = c.MedicineId,
                medicineName = c.MedicineName,
                newQuantity = c.NewQuantity,
                addedQuantity = c.AddedQuantity
            }).ToList()
        };

        // Send to Pharmacist and Admin only
        var roles = new[] { "Pharmacist", "Admin" };
        foreach (var role in roles)
        {
            await _hub.Clients.Group(role).SendAsync("InventoryStockIncreased", payload);
        }
    }
}