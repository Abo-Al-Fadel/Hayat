using System.ComponentModel.DataAnnotations;

namespace Hayaa.Backend.Dtos.Medicine
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
        
        public int? CategoryId { get; set; }  // Optional - null means no category
        public IFormFile? Image { get; set; } // Optional - null means keep existing image
        public bool? IsHidden { get; set; }   // Optional - null means don't change visibility
    }
}
