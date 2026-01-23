// Models/Notification.cs
using System;

namespace Hayaa.Backend.Models
{
    public class Notification
    {
        public int Id { get; set; }

        // Who should receive it
        public string TargetRole { get; set; } = "";

        public NotificationAction Action { get; set; }// Created / Updated / Deleted
        //public string Entity { get; set; } = ""; // Medicine / Stock

        public int? MedicineId { get; set; }
        public string? MedicineName { get; set; }

        public string Message { get; set; } = "";

        public bool IsRead { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
