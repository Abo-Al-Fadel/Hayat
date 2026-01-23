/*
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using YourNamespace.Hubs;             // required for NotificationPayload
using PharmacyApi.Models;            // Notification model namespace - adjust if yours differs

namespace PharmacyApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MedicineController : ControllerBase
    {
        private readonly PharmacyDbContext _context;
        private readonly IHubContext<NotificationsHub> _hub;

        public MedicineController(PharmacyDbContext context, IHubContext<NotificationsHub> hub)
        {
            _context = context;
            _hub = hub;
        }

        [HttpGet]
        [Authorize]
        public async Task<IActionResult> GetAll([FromQuery] string? name, [FromQuery] decimal? minPrice, [FromQuery] decimal? maxPrice)
        {
            var query = _context.Medicines.AsQueryable();

            if (!string.IsNullOrWhiteSpace(name))
                query = query.Where(m => m.Name.Contains(name));
            if (minPrice.HasValue)
                query = query.Where(m => m.Price >= minPrice.Value);
            if (maxPrice.HasValue)
                query = query.Where(m => m.Price <= maxPrice.Value);

            var medicines = await query.ToListAsync();
            return Ok(medicines);
        }

        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Add([FromBody] CreateMedicineDto dto)
        {
            var medicine = new Medicine
            {
                Name = dto.Name,
                Quantity = dto.Quantity,
                Price = dto.Price,
                Image = dto.Image
            };

            _context.Medicines.Add(medicine);
            await _context.SaveChangesAsync();

            // Persist a Notification record to DB so offline clients can fetch it later
            var notif = new Notification
            {
                Role = "Sales",
                Action = "created",
                MedicineId = medicine.Id,
                MedicineName = medicine.Name,
                Message = $"New medicine added: {medicine.Name}",
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            };

            _context.Notifications.Add(notif);
            await _context.SaveChangesAsync();

            // Broadcast to Sales group
            var payload = new NotificationPayload
            {
                Action = "created",
                Id = medicine.Id,
                Name = medicine.Name,
                Price = medicine.Price,
                Quantity = medicine.Quantity,
                Message = notif.Message,
                Timestamp = notif.CreatedAt
            };

            await _hub.Clients.Group("Sales").SendAsync("ReceiveMedicineNotification", payload);

            return Ok(medicine);
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Update(int id, [FromBody] CreateMedicineDto dto)
        {
            var existing = await _context.Medicines.FindAsync(id);
            if (existing == null) return NotFound();

            existing.Name = dto.Name;
            existing.Quantity = dto.Quantity;
            existing.Price = dto.Price;
            existing.Image = dto.Image;
            await _context.SaveChangesAsync();

            // Persist notification record
            var notif = new Notification
            {
                Role = "Sales",
                Action = "updated",
                MedicineId = existing.Id,
                MedicineName = existing.Name,
                Message = $"Medicine updated: {existing.Name}",
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            };

            _context.Notifications.Add(notif);
            await _context.SaveChangesAsync();

            // Broadcast to Sales group
            var payload = new NotificationPayload
            {
                Action = "updated",
                Id = existing.Id,
                Name = existing.Name,
                Price = existing.Price,
                Quantity = existing.Quantity,
                Message = notif.Message,
                Timestamp = notif.CreatedAt
            };

            await _hub.Clients.Group("Sales").SendAsync("ReceiveMedicineNotification", payload);

            return Ok(existing);
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var medicine = await _context.Medicines.FindAsync(id);
            if (medicine == null) return NotFound();

            // Capture data for notification before removal
            var removedId = medicine.Id;
            var removedName = medicine.Name;

            _context.Medicines.Remove(medicine);
            await _context.SaveChangesAsync();

            // Persist notification record for the deletion
            var notif = new Notification
            {
                Role = "Sales",
                Action = "deleted",
                MedicineId = removedId,
                MedicineName = removedName,
                Message = $"Medicine removed: {removedName}",
                IsRead = false,
                CreatedAt = DateTime.UtcNow
            };

            _context.Notifications.Add(notif);
            await _context.SaveChangesAsync();

            // Broadcast deletion
            var payload = new NotificationPayload
            {
                Action = "deleted",
                Id = removedId,
                Name = removedName,
                Message = notif.Message,
                Timestamp = notif.CreatedAt
            };

            await _hub.Clients.Group("Sales").SendAsync("ReceiveMedicineNotification", payload);

            return NoContent();
        }
    }
}
*/
// Controllers/MedicineController.cs
using Hayaa.Backend.Dtos.Medicine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class MedicineController : ControllerBase
{
    private readonly IMedicineService _medicineService;
    private readonly ILogger<MedicineController> _logger;

    public MedicineController(IMedicineService medicineService, ILogger<MedicineController> logger)
    {
        _medicineService = medicineService;
        _logger = logger;
    }

    [HttpGet]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> GetAll([FromQuery] string? name, [FromQuery] decimal? minPrice, [FromQuery] decimal? maxPrice)
    {
        // Admin sees all medicines (including hidden), Pharmacist sees only visible
        var isAdmin = User.IsInRole("Admin");
        var meds = await _medicineService.GetAllAsync(name, minPrice, maxPrice, includeHidden: isAdmin);
        return Ok(meds);
    }

    [HttpGet("{id}")]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> GetById(int id)
    {
        var med = await _medicineService.GetByIdAsync(id);
        if (med == null) return NotFound();
        return Ok(med);
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Add([FromForm] CreateMedicineDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var created = await _medicineService.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(int id, [FromForm] UpdateMedicineDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var updated = await _medicineService.UpdateAsync(id, dto);
        if (updated == null) return NotFound();
        return Ok(updated);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var message = await _medicineService.DeleteAsync(id);
            return Ok(new { message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpGet("search")]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> Search(string name)
    {
        // Admin sees all medicines (including hidden), Pharmacist sees only visible
        var isAdmin = User.IsInRole("Admin");
        var medicines = await _medicineService.SearchMedicinesAsync(name, includeHidden: isAdmin);
        if (medicines.Count == 0) return NotFound("No medicines found");
        return Ok(medicines);
    }
    [HttpGet("by-category/{categoryId}")]
    [Authorize(Roles = "Admin,Pharmacist")]
    public async Task<IActionResult> GetByCategory(int categoryId)
    {
        try
        {
            // Admin sees all medicines (including hidden), Pharmacist sees only visible
            var isAdmin = User.IsInRole("Admin");
            var medicines = await _medicineService.GetByCategoryAsync(categoryId, includeHidden: isAdmin);
            return Ok(medicines);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new
            {
                message = ex.Message,
                data = new List<MedicineDto>()
            });
        }
    }

    [HttpPatch("{id}/visibility")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ToggleVisibility(int id, [FromBody] ToggleVisibilityDto dto)
    {
        try
        {
            var updated = await _medicineService.ToggleVisibilityAsync(id, dto.IsHidden);
            return Ok(updated);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }


}
