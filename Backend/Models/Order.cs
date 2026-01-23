public class Order
{
    public int Id { get; set; }
    public bool IsOnline { get; set; }
    public int? OrderStatusId { get; set; }
    public PaymentMethodEnum PaymentMethod { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public decimal TotalPrice { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    public List<OrderItem> Items { get; set; } = new List<OrderItem>();
}
