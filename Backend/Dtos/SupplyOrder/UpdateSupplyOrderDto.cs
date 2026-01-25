public class UpdateSupplyOrderDto
{
    public int? SupplierId { get; set; }
    public List<CreateSupplyOrderItemDto>? Items { get; set; }
    public string? Notes { get; set; }
}
