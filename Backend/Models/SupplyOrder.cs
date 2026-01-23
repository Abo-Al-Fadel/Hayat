using System.ComponentModel.DataAnnotations;

/// <summary>
/// Supply Order entity representing orders placed with suppliers
/// 
/// Status Flow:
/// 1. Created   → Admin creates the order
/// 2. Approved  → Admin approves internally
/// 3. Ordered   → Admin confirms order sent to supplier
/// 4. Shipped   → Storage Manager marks as shipped by supplier
/// 5. Received  → Storage Manager marks as received at pharmacy
/// 6. Stored    → Added to inventory (triggers stock update)
/// 7. Cancelled → Admin cancels (only before Shipped)
/// 
/// Edit Restrictions:
/// - Order can only be edited when Status == Created
/// - Once approved or beyond, items and supplier cannot be changed
/// </summary>
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
