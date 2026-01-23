using System.ComponentModel.DataAnnotations;

public class OrderItem
{
    public int Id { get; set; }

    public int MedicineId { get; set; }
    [Required]
    public Medicine Medicine { get; set; }

    public int Quantity { get; set; }
    public decimal Price { get; set; }

    public int OrderId { get; set; }
    [Required]
    public Order Order { get; set; } 
}
