using System.Text.Json.Serialization;
public class Supplier
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    [JsonIgnore]
    public ICollection<SupplyOrder> SupplyOrders { get; set; } = new List<SupplyOrder>();
}
