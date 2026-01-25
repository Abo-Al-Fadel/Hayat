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
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal UnitPrice { get; set; }
}
