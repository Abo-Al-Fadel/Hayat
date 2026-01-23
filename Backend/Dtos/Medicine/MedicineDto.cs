namespace Hayaa.Backend.Dtos.Medicine
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
    }
}
