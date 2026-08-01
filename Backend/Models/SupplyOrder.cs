using System.ComponentModel.DataAnnotations;

public class SupplyOrder
{
    public int Id { get; set; }

    // Timestamps for status progression
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ApprovedAt { get; set; }
    public DateTime? OrderedAt { get; set; }
    public DateTime? ShippedAt { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public DateTime? StoredAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    public int SupplierId { get; set; }
    [Required]
    public Supplier Supplier { get; set; } = null!;

    public int SupplyOrderStatusId { get; set; }
    public SupplyOrderStatusEnum Status { get; set; } = SupplyOrderStatusEnum.Created;

    public ICollection<SupplyOrderItem> Items { get; set; } = new List<SupplyOrderItem>();

    public string? Notes { get; set; }
}
