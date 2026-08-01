public class Medicine
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }

    /// <summary>Retail (sell) price charged to the customer.</summary>
    public decimal Price { get; set; }

    /// <summary>
    /// Weighted-average acquisition cost per unit, recalculated each time a supply
    /// order is Stored. Used for gross-profit reporting and for suggesting a retail
    /// price from the configured markup tiers. Zero means "never purchased through a
    /// supply order", in which case profit for that medicine is unknown rather than 100%.
    /// </summary>
    public decimal CostPrice { get; set; }
    public string? Image { get; set; }
    public bool IsHidden { get; set; } = false;
    public int LowStockThreshold { get; set; } = 30;

    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
}
