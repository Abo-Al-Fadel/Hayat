using System.ComponentModel.DataAnnotations;

public class SupplyOrderItemDto
{
    [Required]
    public int MedicineId { get; set; }

    [Required]
    [Range(1, int.MaxValue, ErrorMessage = "Quantity must be positive")]
    public int Quantity { get; set; }
    
    /// <summary>
    /// Medicine name from related Medicine entity
    /// </summary>
    public string MedicineName { get; set; } = string.Empty;
    
    /// <summary>
    /// Unit price (BUY/COST price) - what pharmacy paid to supplier
    /// </summary>
    public decimal UnitPrice { get; set; }
    
    /// <summary>
    /// Medicine image URL for visual identification in Storage Manager dashboard
    /// </summary>
    public string? MedicineImageUrl { get; set; }
}