using System.ComponentModel.DataAnnotations;

public class CreateMedicineDto
{
    [Required(ErrorMessage = "Medicine name is required")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Quantity is required")]
    [Range(0, int.MaxValue, ErrorMessage = "Quantity must be non-negative")]
    public int Quantity { get; set; }

    [Required(ErrorMessage = "Price is required")]
    [Range(0, double.MaxValue, ErrorMessage = "Price must be non-negative")]
    public decimal Price { get; set; }

    public int? CategoryId { get; set; }
    public IFormFile? Image { get; set; }
}
