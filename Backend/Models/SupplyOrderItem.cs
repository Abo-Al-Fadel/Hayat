using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

public class SupplyOrderItem
{
    public int Id { get; set; }

    public int SupplyOrderId { get; set; }
    [Required]
    public SupplyOrder SupplyOrder { get; set; } = null!;

    public int MedicineId { get; set; }
    [Required]
    public Medicine Medicine { get; set; } = null!;

    public int Quantity { get; set; }
    
    /// <summary>
    /// Unit price (BUY/COST price) - what pharmacy pays to supplier
    /// This is stored separately from Medicine.Price (retail/sell price)
    /// </summary>
    [Column(TypeName = "decimal(18,2)")]
    public decimal UnitPrice { get; set; }
}
