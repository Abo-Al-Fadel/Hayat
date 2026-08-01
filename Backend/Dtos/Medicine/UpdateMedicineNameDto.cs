using System.ComponentModel.DataAnnotations;
public class UpdateMedicineNameDto
{
    [Required(ErrorMessage = "Medicine name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Name must be between 1 and 200 characters")]
    public string Name { get; set; } = string.Empty;
}
