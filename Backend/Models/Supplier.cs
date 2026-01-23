using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

public class Supplier
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    [JsonIgnore]
    public ICollection<SupplyOrder> SupplyOrders { get; set; } = new List<SupplyOrder>();
}
