using System.ComponentModel.DataAnnotations;

public class SupplyOrderItemDto
{
    [Required]
    public int MedicineId { get; set; }

    [Required]
    [Range(1, int.MaxValue, ErrorMessage = "Quantity must be positive")]
    
    public int Quantity { get; set; }
    public string MedicineName { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public string? MedicineImageUrl { get; set; }
}