public class Stock
{
    public int Id { get; set; }
    public int MedicineId { get; set; }
    public Medicine Medicine { get; set; } = default!;
    public int Quantity { get; set; }
}
