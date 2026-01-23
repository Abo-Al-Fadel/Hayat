using System.ComponentModel.DataAnnotations;

/// <summary>
/// DTO for creating a new supply order
/// </summary>
public class CreateSupplyOrderDto
{
    [Required]
    public int SupplierId { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "Order must contain at least one item")]
    public List<CreateSupplyOrderItemDto> Items { get; set; } = new();

    /// <summary>
    /// Optional notes for the supply order
    /// </summary>
    public string? Notes { get; set; }
}