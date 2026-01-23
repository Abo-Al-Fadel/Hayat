/// <summary>
/// DTO for updating a supply order (only allowed when status is "Created")
/// </summary>
public class UpdateSupplyOrderDto
{
    public int? SupplierId { get; set; }
    public List<CreateSupplyOrderItemDto>? Items { get; set; }
    public string? Notes { get; set; }
}
