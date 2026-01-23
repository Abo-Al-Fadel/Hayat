public class CreateSupplyOrderItemDto
{
    public int MedicineId { get; set; }
    public int Quantity { get; set; }
    
    /// <summary>
    /// Unit price (BUY/COST price) paid to supplier
    /// </summary>
    public decimal UnitPrice { get; set; }
}
