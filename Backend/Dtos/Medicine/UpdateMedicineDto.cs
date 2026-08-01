using System.ComponentModel.DataAnnotations;

namespace Hayat.Backend.Dtos.Medicine
{
    public class UpdateMedicineDto
    {
        [Required(ErrorMessage = "Medicine name is required")]
        public string Name { get; set; } = string.Empty;

        [Required(ErrorMessage = "Price is required")]
        [Range(0, double.MaxValue, ErrorMessage = "Price must be non-negative")]
        public decimal Price { get; set; }

        [Required(ErrorMessage = "Quantity is required")]
        [Range(0, int.MaxValue, ErrorMessage = "Quantity must be non-negative")]
        public int Quantity { get; set; }

        public int? CategoryId { get; set; }
        public IFormFile? Image { get; set; }
        public bool? IsHidden { get; set; }
    }
}
