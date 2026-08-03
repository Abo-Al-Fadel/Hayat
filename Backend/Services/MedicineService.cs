using AutoMapper;
using Hayat.Backend.Dtos.Medicine;
using Hayat.Backend.Interfaces;
using Hayat.Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services
{
    public class MedicineService : IMedicineService
    {
        private readonly PharmacyDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ILogger<MedicineService> _logger;
        private readonly IMapper _mapper;
        private readonly IPricingService _pricingService;

        // No IWebHostEnvironment: images live in the database now, so this service does not
        // touch the filesystem at all. Keeping the dependency would imply otherwise.
        public MedicineService(PharmacyDbContext context, INotificationService notificationService, ILogger<MedicineService> logger, IMapper mapper, IPricingService pricingService)
        {
            _context = context;
            _notificationService = notificationService;
            _logger = logger;
            _mapper = mapper;
            _pricingService = pricingService;
        }

        /// <summary>
        /// Maps to a DTO, attaching purchase cost and markup only when the caller is
        /// permitted to see them. Supplier cost is Admin-only.
        /// </summary>
        private MedicineDto ToDto(Medicine medicine, bool includeCost)
        {
            var dto = _mapper.Map<MedicineDto>(medicine);
            if (includeCost)
            {
                dto.CostPrice = medicine.CostPrice;
                dto.MarkupPercent = _pricingService.CalculateMarkupPercent(medicine.CostPrice, medicine.Price);
            }
            return dto;
        }

        public async Task<IEnumerable<MedicineDto>> GetAllAsync(string? name, decimal? minPrice, decimal? maxPrice, bool includeHidden = true, int? page = null, int? pageSize = null, bool includeCost = false)
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

            // Paging is opt-in so existing callers that want the whole catalogue
            // (the Admin dashboard) keep working unchanged.
            if (page.HasValue || pageSize.HasValue)
            {
                var effectivePage = Math.Max(page ?? 1, 1);
                var effectivePageSize = Math.Clamp(pageSize ?? 20, 1, 200);

                // Skip/Take requires a deterministic order.
                query = query
                    .OrderBy(m => m.Id)
                    .Skip((effectivePage - 1) * effectivePageSize)
                    .Take(effectivePageSize);
            }

            var list = await query.ToListAsync();
            return list.Select(m => ToDto(m, includeCost)).ToList();
        }

        public async Task<MedicineDto?> GetByIdAsync(int id, bool includeCost = false)
        {
            var m = await _context.Medicines.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            return m == null ? null : ToDto(m, includeCost);
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

            // Validate the upload before inserting anything, so a rejected image does not
            // leave a medicine behind.
            var hasImage = dto.Image != null && dto.Image.Length > 0;
            if (hasImage) await ReadImageAsync(dto.Image!);

            var medicine = new Medicine
            {
                Name = dto.Name,
                Price = dto.Price,
                Quantity = dto.Quantity,
                CategoryId = categoryId,  // Use the validated categoryId
                Image = null              // set below: the URL needs the generated id
            };

            _context.Medicines.Add(medicine);
            await _context.SaveChangesAsync();

            if (hasImage)
            {
                medicine.Image = await StoreImageAsync(medicine.Id, dto.Image!);
                await _context.SaveChangesAsync();
            }

            // persist notification + broadcast via notification service
            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Created, medicine, AppRole.Admin);

            // Create/update/visibility/rename are Admin-only endpoints, so cost is safe to return.
            return ToDto(medicine, includeCost: true);
        }

        public async Task<MedicineDto?> UpdateAsync(int id, UpdateMedicineDto dto)
        {
            // Debug logging
            _logger.LogInformation("UpdateAsync called for id={Id} with CategoryId={CategoryId}, HasImage={HasImage}",
                id, dto.CategoryId, dto.Image != null);

            var medicine = await _context.Medicines.FindAsync(id);
            if (medicine == null)
                throw new KeyNotFoundException($"Medicine with id {id} not found.");

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

            // Handle image upload. Replacing overwrites the single row for this medicine,
            // so there is no old file to hunt down and delete.
            if (dto.Image != null && dto.Image.Length > 0)
            {
                _logger.LogInformation("Processing image upload: {FileName}, Size: {Size} bytes",
                    dto.Image.FileName, dto.Image.Length);

                medicine.Image = await StoreImageAsync(medicine.Id, dto.Image);
                _logger.LogInformation("Image stored: {ImageUrl}", medicine.Image);
            }

            await _context.SaveChangesAsync();

            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Updated, medicine, AppRole.Admin);

            return ToDto(medicine, includeCost: true);
        }

        // Uploaded images are served back out by MedicineController, so an unrestricted
        // upload is a stored-XSS vector (.html/.svg rendered same-origin) as well as a
        // storage-fill risk. Extension and content type must both be on the allowlist, and
        // the Content-Type sent back to the browser is the canonical one from that
        // allowlist - never the client-supplied string.
        private const long MaxImageBytes = 5 * 1024 * 1024;

        private static readonly Dictionary<string, string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            ["image/jpeg"] = ".jpg",
            ["image/pjpeg"] = ".jpg",
            ["image/png"] = ".png",
            ["image/webp"] = ".webp",
            ["image/gif"] = ".gif",
        };

        private static readonly HashSet<string> AllowedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".webp", ".gif"
        };

        /// <summary>
        /// Validates an upload and returns its bytes plus the canonical content type.
        /// Storage is the caller's business - it needs the medicine's id, which does not
        /// exist yet when creating one.
        /// </summary>
        private static async Task<(byte[] Data, string ContentType)> ReadImageAsync(IFormFile image)
        {
            if (image.Length > MaxImageBytes)
                throw new InvalidOperationException($"Image exceeds the {MaxImageBytes / (1024 * 1024)} MB limit.");

            var suppliedExtension = Path.GetExtension(image.FileName);
            if (string.IsNullOrWhiteSpace(suppliedExtension) || !AllowedImageExtensions.Contains(suppliedExtension))
                throw new InvalidOperationException($"Unsupported image type '{suppliedExtension}'. Allowed: {string.Join(", ", AllowedImageExtensions)}.");

            if (!AllowedImageTypes.TryGetValue(image.ContentType ?? string.Empty, out var canonicalExtension))
                throw new InvalidOperationException($"Unsupported image content type '{image.ContentType}'.");

            // Map back from the canonical extension so the stored type can only ever be
            // one of the five we allow, whatever the client claimed.
            var canonicalContentType = AllowedImageTypes
                .First(pair => pair.Value == canonicalExtension && pair.Key != "image/pjpeg").Key;

            using var buffer = new MemoryStream();
            await image.CopyToAsync(buffer);

            return (buffer.ToArray(), canonicalContentType);
        }

        /// <summary>
        /// Stores (or replaces) a medicine's image and returns the URL to reach it.
        ///
        /// The URL carries the upload timestamp so a replaced image is not masked by a
        /// cached copy of the previous one - the path alone never changes.
        /// </summary>
        private async Task<string> StoreImageAsync(int medicineId, IFormFile image)
        {
            var (data, contentType) = await ReadImageAsync(image);

            var existing = await _context.MedicineImages.FindAsync(medicineId);
            if (existing is null)
            {
                _context.MedicineImages.Add(new MedicineImage
                {
                    MedicineId = medicineId,
                    Data = data,
                    ContentType = contentType,
                    UploadedAtUtc = DateTime.UtcNow
                });
            }
            else
            {
                existing.Data = data;
                existing.ContentType = contentType;
                existing.UploadedAtUtc = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Stored {Bytes} byte {ContentType} image for medicine {MedicineId}",
                data.Length, contentType, medicineId);

            return BuildImageUrl(medicineId, DateTime.UtcNow);
        }

        internal static string BuildImageUrl(int medicineId, DateTime uploadedAtUtc) =>
            $"/api/Medicine/{medicineId}/image?v={uploadedAtUtc.Ticks}";

        public async Task<(byte[] Data, string ContentType)?> GetImageAsync(int medicineId)
        {
            var image = await _context.MedicineImages
                .AsNoTracking()
                .FirstOrDefaultAsync(i => i.MedicineId == medicineId);

            return image is null ? null : (image.Data, image.ContentType);
        }


        public async Task<string> DeleteAsync(int id)
        {
            var m = await _context.Medicines.FindAsync(id);
            if (m == null)
                throw new KeyNotFoundException($"Medicine with id {id} not found.");

            var removedName = m.Name;
            var removedId = m.Id;

            // A medicine that appears on a past sale or supply order cannot be removed
            // without destroying that history, so those are archived (hidden) instead.
            // Anything never referenced is genuinely deleted - previously EVERY delete
            // was a soft delete, which made "Delete" indistinguishable from "Hide" and
            // looked to the Admin like the deletion had not saved at all, because the
            // Admin list includes hidden medicines.
            var isReferenced =
                await _context.OrderItems.AnyAsync(oi => oi.MedicineId == id) ||
                await _context.SupplyOrderItems.AnyAsync(si => si.MedicineId == id);

            string message;
            if (isReferenced)
            {
                m.IsHidden = true;
                message = $"'{removedName}' appears on past orders, so it was archived and hidden from sale rather than deleted.";
                _logger.LogInformation("Medicine {Id} '{Name}' archived (referenced by existing orders)", removedId, removedName);
            }
            else
            {
                _context.Medicines.Remove(m);
                message = $"Medicine '{removedName}' was deleted.";
                _logger.LogInformation("Medicine {Id} '{Name}' permanently deleted (no order history)", removedId, removedName);
            }

            await _context.SaveChangesAsync();

            // Notify Pharmacist to remove from their view
            await _notificationService.NotifyMedicineChangeAsync(NotificationAction.Deleted, m, AppRole.Admin);

            return message;
        }

        public async Task<List<MedicineDto>> SearchMedicinesAsync(string name, bool includeHidden = true, bool includeCost = false)
        {
            // AsNoTracking for read-only search results
            var query = _context.Medicines
                .AsNoTracking()
                .Where(m => m.Name.Contains(name));

            if (!includeHidden)
                query = query.Where(m => !m.IsHidden);

            // Mapped through ToDto like every other catalogue read. This used to return
            // the Medicine entity itself, which carries CostPrice - so the one endpoint
            // that skipped the DTO handed the pharmacy's purchase price to every role
            // allowed to search, Pharmacist and the read-only observer included.
            var list = await query.ToListAsync();
            return list.Select(m => ToDto(m, includeCost)).ToList();
        }

        public async Task<List<MedicineDto>> GetByCategoryAsync(int categoryId, bool includeHidden = true, bool includeCost = false)
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
                    IsHidden = m.IsHidden,
                    CategoryId = m.CategoryId,
                    // Cost is Admin-only; the projection sets it conditionally.
                    CostPrice = includeCost ? m.CostPrice : (decimal?)null
                })
                .ToListAsync();

            // An existing category with no medicines is an empty result, not an error.
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

            return ToDto(medicine, includeCost: true);
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

            return ToDto(medicine, includeCost: true);
        }
    }
}
