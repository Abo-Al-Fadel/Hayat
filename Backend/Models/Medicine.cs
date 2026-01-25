public class Medicine
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
    public string? Image { get; set; }
    public bool IsHidden { get; set; } = false;
    public int LowStockThreshold { get; set; } = 30;

    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
}
