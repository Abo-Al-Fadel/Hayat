using System.ComponentModel.DataAnnotations;

public class CreateSupplyOrderDto
{
    [Required]
    public int SupplierId { get; set; }
    [Required]
    [MinLength(1, ErrorMessage = "Order must contain at least one item")]
    public List<CreateSupplyOrderItemDto> Items { get; set; } = new();
    public string? Notes { get; set; }
}