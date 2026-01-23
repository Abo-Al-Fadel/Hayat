using System.ComponentModel.DataAnnotations;

public class CheckoutDto
{
    public List<OrderItemDto> Items { get; set; } = new();

    [Required]
    [Range(1, double.MaxValue, ErrorMessage = "Total amount must be positive")]
    public decimal TotalAmount { get; set; }

    [Required]
    public PaymentMethodEnum PaymentMethod { get; set; }

    [Required]
    public int OrderId { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }
}