using System.ComponentModel.DataAnnotations;

public class OrderItemDto
{
    [Required]
    public int MedicineId { get; set; }

    [Required]
    [Range(1, int.MaxValue, ErrorMessage = "Quantity must be at least 1")]
    public int Quantity { get; set; }
    [Required]
    public PaymentMethodEnum PaymentMethod { get; set; } 
}
