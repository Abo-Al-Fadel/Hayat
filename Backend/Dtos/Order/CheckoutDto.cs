using System.ComponentModel.DataAnnotations;

public class CheckoutDto
{
    public List<OrderItemDto> Items { get; set; } = new();

    /// <summary>
    /// Client-side total, kept for request logging/diagnostics only.
    /// The server recomputes the authoritative total from current medicine prices,
    /// so this value is never trusted. It must NOT be [Required] with a minimum of 1 -
    /// that rejected every legitimate cart worth less than 1.00.
    /// </summary>
    public decimal TotalAmount { get; set; }

    [Required]
    public PaymentMethodEnum PaymentMethod { get; set; }

    /// <summary>Ignored on create; the server assigns the order id.</summary>
    public int OrderId { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }
}