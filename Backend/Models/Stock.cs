using System.ComponentModel.DataAnnotations;

public class Stock
{
    public int Id { get; set; }
    public int MedicineId { get; set; }
    [Required]
    public Medicine Medicine { get; set; }
    public int Quantity { get; set; }
}
