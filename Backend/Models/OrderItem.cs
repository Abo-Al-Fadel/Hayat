public class OrderItem
{
    public int Id { get; set; }

    public int MedicineId { get; set; }
    public Medicine Medicine { get; set; } = default!;

    public int Quantity { get; set; }

    /// <summary>Unit sell price at the moment of sale.</summary>
    public decimal Price { get; set; }

    /// <summary>
    /// Unit acquisition cost captured at the moment of sale. Snapshotted (rather than
    /// read back from Medicine at report time) so historical gross profit stays correct
    /// even after supplier costs change.
    /// </summary>
    public decimal CostPrice { get; set; }

    public int OrderId { get; set; }
    public Order Order { get; set; } = default!;
}
