using System.ComponentModel.DataAnnotations;

public class CreateSupplierDto
{
    [Required]
    public string Name { get; set; } = null!;

    [Phone]
    public string? Phone { get; set; }

    [EmailAddress]
    public string? Email { get; set; }
}
