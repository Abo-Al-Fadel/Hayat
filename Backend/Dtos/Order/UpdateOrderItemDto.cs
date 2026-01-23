using System.ComponentModel.DataAnnotations;

public class UpdateOrderItemDto
{
    [Required]
    public int Id { get; set; }

    [Required]
    public int MedicineId { get; set; }

    [Required]
    [Range(1, int.MaxValue)]
    public int Quantity { get; set; }
}