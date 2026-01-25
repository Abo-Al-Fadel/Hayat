using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class StockController : ControllerBase
    {
        private readonly PharmacyDbContext _context;

        public StockController(PharmacyDbContext context)
        {
            _context = context;
        }

        /// <summary>Get all stock</summary>
        [HttpGet]
        [Authorize(Roles = "Admin,StorageManager,Pharmacist")]
        public async Task<IActionResult> GetAll()
        {
            var stocks = await _context.Stocks
                .Include(s => s.Medicine)
                .ToListAsync();

            return Ok(stocks);
        }

        /// <summary>Get stock by medicine</summary>
        [HttpGet("{medicineId}")]
        [Authorize(Roles = "Admin,StorageManager,Pharmacist")]
        public async Task<IActionResult> GetByMedicine(int medicineId)
        {
            var stock = await _context.Stocks
                .Include(s => s.Medicine)
                .FirstOrDefaultAsync(s => s.MedicineId == medicineId);

            if (stock == null)
                return NotFound("Stock not found for this medicine");

            return Ok(stock);
        }

        /// <summary>Adjust stock manually</summary>
        [HttpPut("{medicineId}/adjust")]
        [Authorize(Roles = "Admin,StorageManager")]
        public async Task<IActionResult> AdjustStock(int medicineId, [FromBody] int quantity)
        {
            if (quantity < 0)
                return BadRequest("Quantity cannot be negative");

            var stock = await _context.Stocks
                .FirstOrDefaultAsync(s => s.MedicineId == medicineId);

            if (stock == null)
                return NotFound("Stock not found");

            stock.Quantity = quantity;
            await _context.SaveChangesAsync();

            return Ok("Stock updated successfully");
        }

        /// <summary>Get low stock alerts</summary>
        [HttpGet("low-stock")]
        [Authorize(Roles = "Admin,StorageManager")]
        public async Task<IActionResult> GetLowStock([FromQuery] int threshold = 10)
        {
            var lowStock = await _context.Stocks
                .Include(s => s.Medicine)
                .Where(s => s.Quantity <= threshold)
                .ToListAsync();

            return Ok(lowStock);
        }
    }
}
