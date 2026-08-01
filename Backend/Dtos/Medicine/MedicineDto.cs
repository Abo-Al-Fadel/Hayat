namespace Hayat.Backend.Dtos.Medicine
{
    public class MedicineDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Price { get; set; }
        public int Quantity { get; set; }
        public string? Image { get; set; }
        public int? CategoryId { get; set; }
        public bool IsHidden { get; set; }

        /// <summary>
        /// Weighted-average purchase cost. Admin-only: null for every other role, so
        /// supplier pricing is not exposed to the sales floor.
        /// </summary>
        public decimal? CostPrice { get; set; }

        /// <summary>Markup of the current sell price over cost. Admin-only; null when cost is unknown.</summary>
        public decimal? MarkupPercent { get; set; }
    }
}
