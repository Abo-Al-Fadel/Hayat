public class NotificationPayLoad
{
    public string Action { get; set; } = "";
    public int? Id { get; set; }
    public string? Name { get; set; }
    public string? Message { get; set; }
    public string? FromUser { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public decimal? Price { get; set; }
    public int? Quantity { get; set; }
}