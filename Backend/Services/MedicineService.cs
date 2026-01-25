using AutoMapper;
using Hayaa.Backend.Dtos.Medicine;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services
{
    public class MedicineService : IMedicineService
    {
        private readonly PharmacyDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ILogger<MedicineService> _logger;
        private readonly IMapper _mapper;
        private readonly IWebHostEnvironment _env;

        public MedicineService(PharmacyDbContext context, INotificationService notificationService, ILogger<MedicineService> logger, IMapper mapper, IWebHostEnvironment env)
        {
            _context = context;
            _notificationService = notificationService;
            _logger = logger;
            _mapper = mapper;
            _env = env;
        }

        public async Task<IEnumerable<MedicineDto>> GetAllAsync(string? name, decimal? minPrice, decimal? maxPrice, bool includeHidden = true)
        {
            var query = _context.Medicines.AsQueryable().AsNoTracking();

            // Filter hidden medicines unless explicitly requested (Admin can see all)
            if (!includeHidden)
                query = query.Where(m => !m.IsHidden);

            if (!string.IsNullOrWhiteSpace(name))
                query = query.Where(m => m.Name.Contains(name));
            if (minPrice.HasValue)
                query = query.Where(m => m.Price >= minPrice.Value);
            if (maxPrice.HasValue)
                query = query.Where(m => m.Price <= maxPrice.Value);

            var list = await query.ToListAsync();
            return _mapper.Map<IEnumerable<MedicineDto>>(list);
        }

        public async Task<MedicineDto?> GetByIdAsync(int id)
        {
            var m = await _context.Medicines.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            return _mapper.Map<MedicineDto?>(m);
        }

        public async Task<MedicineDto> CreateAsync(CreateMedicineDto dto)
        {
            // Handle optional CategoryId
            int? categoryId = null;
            if (dto.CategoryId.HasValue && dto.CategoryId.Value > 0)
            {
                bool categoryExists = await _context.Categories.AnyAsync(c => c.Id == dto.CategoryId.Value);
                if (categoryExists)
                {
                    categoryId = dto.CategoryId.Value;
                }
            }

            string? imagePath = null;

            if (dto.Image != null && dto.Image.Length > 0)
            {
                var uploads = Path.Combine(_env.WebRootPath, "images", "medicines");
                Directory.CreateDirectory(uploads);

                var fileName = Guid.NewGuid() + Path.GetExtension(dto.Image.FileName);
                var filePath = Path.Combine(uploads, fileName);

                using var stream = new FileStream(filePath, FileMode.Create);
                await dto.Image.CopyToAsync(stream);

                imagePath = "/images/medicines/" + fileName;
            }

            var medicine = new Medicine
            {
                Name = dto.Name,
                Price = dto.Price,
                Quantity = dto.Quantity,
                CategoryId = categoryId,  // Use the validated categoryId
                Image = imagePath
            };

            _context.Medicines.Add(medicine);
            await _context.SaveChangesAsync();

            // persist notification + broadcast via notification service
            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Created, medicine, AppRole.Admin);

            return _mapper.Map<MedicineDto>(medicine);
        }

        public async Task<MedicineDto?> UpdateAsync(int id, UpdateMedicineDto dto)
        {
            // Debug logging
            _logger.LogInformation("UpdateAsync called for id={Id} with CategoryId={CategoryId}, HasImage={HasImage}",
                id, dto.CategoryId, dto.Image != null);
            
            var medicine = await _context.Medicines.FindAsync(id);
            if (medicine == null)
                throw new Exception("Medicine not found");

            // Handle CategoryId - if HasValue and > 0, validate and set; otherwise set to null
            if (dto.CategoryId.HasValue && dto.CategoryId.Value > 0)
            {
                bool exists = await _context.Categories.AnyAsync(c => c.Id == dto.CategoryId.Value);
                if (!exists)
                {
                    _logger.LogWarning("Invalid category {CategoryId} - setting to null", dto.CategoryId.Value);
                    medicine.CategoryId = null;
                }
                else
                {
                    medicine.CategoryId = dto.CategoryId.Value;
                }
            }
            else
            {
                // CategoryId not provided or is 0 - set to null
                medicine.CategoryId = null;
            }

            // Update required fields
            medicine.Name = dto.Name;
            medicine.Price = dto.Price;
            medicine.Quantity = dto.Quantity;

            // Handle IsHidden - only update if explicitly provided
            if (dto.IsHidden.HasValue)
            {
                medicine.IsHidden = dto.IsHidden.Value;
            }

            // Handle image upload
            if (dto.Image != null && dto.Image.Length > 0)
            {
                _logger.LogInformation("Processing image upload: {FileName}, Size: {Size} bytes", 
                    dto.Image.FileName, dto.Image.Length);
                    
                // Delete old image first
                if (!string.IsNullOrEmpty(medicine.Image))
                {
                    var oldPath = Path.Combine(_env.WebRootPath, medicine.Image.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                    _logger.LogInformation("Attempting to delete old image: {OldPath}", oldPath);
                    
                    if (File.Exists(oldPath))
                    {
                        File.Delete(oldPath);
                        _logger.LogInformation("Old image deleted successfully");
                    }
                }

                // Save new image
                var uploads = Path.Combine(_env.WebRootPath, "images", "medicines");
                Directory.CreateDirectory(uploads);

                var fileName = Guid.NewGuid() + Path.GetExtension(dto.Image.FileName);
                var filePath = Path.Combine(uploads, fileName);

                _logger.LogInformation("Saving new image to: {FilePath}", filePath);
                
                using var stream = new FileStream(filePath, FileMode.Create);
                await dto.Image.CopyToAsync(stream);

                medicine.Image = "/images/medicines/" + fileName;
                _logger.LogInformation("Image saved successfully: {ImagePath}", medicine.Image);
            }

            await _context.SaveChangesAsync();

            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Updated, medicine, AppRole.Admin);

            return _mapper.Map<MedicineDto>(medicine);
        }


        public async Task<string> DeleteAsync(int id)
        {
            var m = await _context.Medicines.FindAsync(id);
            if (m == null)
                throw new KeyNotFoundException($"Medicine with id {id} not found.");

            // SOFT DELETE: Mark as hidden instead of hard delete
            // This preserves FK integrity with OrderItems, SupplyOrderItems, etc.
            var removedName = m.Name;
            var removedId = m.Id;

            m.IsHidden = true;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Medicine {Id} '{Name}' soft-deleted (marked as hidden)", removedId, removedName);

            // Notify Pharmacist to remove from their view
            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Deleted, m, AppRole.Admin);

            return $"Medicine '{removedName}' (ID: {removedId}) was deleted successfully.";
        }
        
        public async Task<List<Medicine>> SearchMedicinesAsync(string name, bool includeHidden = true)
        {
            // AsNoTracking for read-only search results
            var query = _context.Medicines
                .AsNoTracking()
                .Where(m => m.Name.Contains(name));
            
            if (!includeHidden)
                query = query.Where(m => !m.IsHidden);
                
            return await query.ToListAsync();
        }

        public async Task<List<MedicineDto>> GetByCategoryAsync(int categoryId, bool includeHidden = true)
        {
            // Check category exists (AsNoTracking for read-only check)
            var categoryExists = await _context.Categories
                .AsNoTracking()
                .AnyAsync(c => c.Id == categoryId);

            if (!categoryExists)
                throw new KeyNotFoundException("Category not found");

            // Get medicines - filter hidden if requested (projection eliminates need for AsNoTracking)
            var query = _context.Medicines.Where(m => m.CategoryId == categoryId);
            
            if (!includeHidden)
                query = query.Where(m => !m.IsHidden);

            var medicines = await query
                .AsNoTracking()
                .Select(m => new MedicineDto
                {
                    Id = m.Id,
                    Name = m.Name,
                    Quantity = m.Quantity,
                    Price = m.Price,
                    Image = m.Image,
                    IsHidden = m.IsHidden
                })
                .ToListAsync();

            if (!medicines.Any())
                throw new InvalidOperationException("No medicines found in this category");

            return medicines;
        }

        public async Task<MedicineDto> ToggleVisibilityAsync(int id, bool isHidden)
        {
            var medicine = await _context.Medicines.FindAsync(id);
            if (medicine == null)
                throw new KeyNotFoundException($"Medicine with id {id} not found.");

            medicine.IsHidden = isHidden;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Medicine {Id} visibility toggled to IsHidden={IsHidden}", id, isHidden);

            // CRITICAL: Broadcast SignalR notification so Pharmacist dashboard updates immediately
            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Updated, medicine, AppRole.Admin);

            return _mapper.Map<MedicineDto>(medicine);
        }

        public async Task<MedicineDto> UpdateNameAsync(int id, string newName)
        {
            if (string.IsNullOrWhiteSpace(newName))
                throw new ArgumentException("Medicine name cannot be empty.", nameof(newName));

            var medicine = await _context.Medicines.FindAsync(id);
            if (medicine == null)
                throw new KeyNotFoundException($"Medicine with id {id} not found.");

            var trimmedName = newName.Trim();
            
            // Check for duplicate name (case-insensitive, excluding current medicine)
            var duplicateExists = await _context.Medicines
                .AsNoTracking()
                .AnyAsync(m => m.Id != id && m.Name.ToLower() == trimmedName.ToLower());
            
            if (duplicateExists)
                throw new InvalidOperationException($"A medicine with the name '{trimmedName}' already exists.");

            var oldName = medicine.Name;
            medicine.Name = trimmedName;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Medicine {Id} name updated from '{OldName}' to '{NewName}'", id, oldName, trimmedName);

            // Broadcast SignalR notification so other dashboards update immediately
            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Updated, medicine, AppRole.Admin);

            return _mapper.Map<MedicineDto>(medicine);
        }
    }
}
    