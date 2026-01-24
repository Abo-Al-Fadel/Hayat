public class Medicine
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public string? Image { get; set; }
    public bool IsHidden { get; set; } = false;
    
    /// <summary>
    /// Threshold below which Admin receives low stock alerts
    /// Default: 30 units. Admin is notified when Quantity drops to or below this value.
    /// </summary>
    public int LowStockThreshold { get; set; } = 30;

    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
}
