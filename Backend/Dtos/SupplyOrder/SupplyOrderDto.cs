public class SupplyOrderDto
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public DateTime? OrderedAt { get; set; }
    public DateTime? ShippedAt { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public DateTime? StoredAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    public int SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;

    public List<SupplyOrderItemDto> Items { get; set; } = new();
    public SupplyOrderStatusEnum Status { get; set; }
    
    public string? Notes { get; set; }
    public decimal? TotalAmount { get; set; }
}