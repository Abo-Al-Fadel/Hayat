// Models/Notification.cs
using System;

namespace Hayaa.Backend.Models
{
    /// <summary>
    /// Notification entity for real-time updates between roles
    /// 
    /// Target Roles:
    /// - Admin: Receives notifications from StorageManager (supply order status changes)
    /// - StorageManager: Receives notifications from Admin (new supply orders)
    /// - Pharmacist: Receives notifications about medicine changes
    /// </summary>
    public class Notification
    {
        public int Id { get; set; }

        // Who should receive it (Admin, Pharmacist, StorageManager)
        public string TargetRole { get; set; } = "";

        public NotificationAction Action { get; set; }

        // For medicine-related notifications
        public int? MedicineId { get; set; }
        public string? MedicineName { get; set; }

        // For supply order notifications
        public int? SupplyOrderId { get; set; }
        public string? SupplyOrderName { get; set; }
        public string? OldStatus { get; set; }
        public string? NewStatus { get; set; }

        public string Message { get; set; } = "";

        public bool IsRead { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
