using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Controllers
{
    /// <summary>
    /// Stock levels.
    ///
    /// These endpoints used to read a separate Stocks table that nothing ever wrote to,
    /// so every response was empty and low-stock reporting was permanently blind. Real
    /// stock lives on Medicine.Quantity - maintained by sales (OrderService) and by
    /// supply orders reaching Stored (SupplyOrderService) - so that is what we read here.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class StockController : ControllerBase
    {
        private readonly PharmacyDbContext _context;
        private readonly ILogger<StockController> _logger;

        public StockController(PharmacyDbContext context, ILogger<StockController> logger)
        {
            _context = context;
            _logger = logger;
        }

        [HttpGet]
        [Authorize(Roles = "Admin,StorageManager,Pharmacist")]
        public async Task<IActionResult> GetAll()
        {
            var stocks = await _context.Medicines
                .AsNoTracking()
                .OrderBy(m => m.Name)
                .Select(m => new
                {
                    medicineId = m.Id,
                    medicineName = m.Name,
                    quantity = m.Quantity,
                    lowStockThreshold = m.LowStockThreshold,
                    isLowStock = m.Quantity > 0 && m.Quantity <= m.LowStockThreshold,
                    isOutOfStock = m.Quantity <= 0
                })
                .ToListAsync();

            return Ok(stocks);
        }

        [HttpGet("{medicineId}")]
        [Authorize(Roles = "Admin,StorageManager,Pharmacist")]
        public async Task<IActionResult> GetByMedicine(int medicineId)
        {
            var stock = await _context.Medicines
                .AsNoTracking()
                .Where(m => m.Id == medicineId)
                .Select(m => new
                {
                    medicineId = m.Id,
                    medicineName = m.Name,
                    quantity = m.Quantity,
                    lowStockThreshold = m.LowStockThreshold,
                    isLowStock = m.Quantity > 0 && m.Quantity <= m.LowStockThreshold,
                    isOutOfStock = m.Quantity <= 0
                })
                .FirstOrDefaultAsync();

            if (stock == null)
                return NotFound("Medicine not found");

            return Ok(stock);
        }

        /// <summary>Sets an absolute stock level, e.g. after a physical stock count.</summary>
        [HttpPut("{medicineId}/adjust")]
        [Authorize(Roles = "Admin,StorageManager")]
        public async Task<IActionResult> AdjustStock(int medicineId, [FromBody] int quantity)
        {
            if (quantity < 0)
                return BadRequest("Quantity cannot be negative");

            var medicine = await _context.Medicines.FindAsync(medicineId);
            if (medicine == null)
                return NotFound("Medicine not found");

            var previous = medicine.Quantity;
            medicine.Quantity = quantity;
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "[Stock] Medicine {MedicineId} adjusted from {Previous} to {Quantity}",
                medicineId, previous, quantity);

            return Ok(new { medicineId, previousQuantity = previous, quantity });
        }

        /// <summary>
        /// Medicines at or below their own configured threshold. Pass an explicit
        /// threshold to override the per-medicine value.
        /// </summary>
        [HttpGet("low-stock")]
        [Authorize(Roles = "Admin,StorageManager")]
        public async Task<IActionResult> GetLowStock([FromQuery] int? threshold = null)
        {
            var query = _context.Medicines.AsNoTracking();

            query = threshold.HasValue
                ? query.Where(m => m.Quantity <= threshold.Value)
                : query.Where(m => m.Quantity <= m.LowStockThreshold);

            var lowStock = await query
                .OrderBy(m => m.Quantity)
                .Select(m => new
                {
                    medicineId = m.Id,
                    medicineName = m.Name,
                    quantity = m.Quantity,
                    lowStockThreshold = m.LowStockThreshold,
                    isOutOfStock = m.Quantity <= 0
                })
                .ToListAsync();

            return Ok(lowStock);
        }
    }
}
