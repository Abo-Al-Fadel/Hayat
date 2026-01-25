using Backend.Services;
using Microsoft.EntityFrameworkCore;

public class CategoryService : ICategoryService
{
    private readonly PharmacyDbContext _context;
    private readonly INotificationService _notificationService;

    public CategoryService(PharmacyDbContext context, INotificationService notificationService)
    {
        _context = context;
        _notificationService = notificationService;
    }

    public async Task<CategoryDto> CreateAsync(CreateCategoryDto dto)
    {
        if (await _context.Categories.AnyAsync(c => c.Name == dto.Name))
            throw new InvalidOperationException("Category already exists");

        var category = new Category { Name = dto.Name };

        _context.Categories.Add(category);
        await _context.SaveChangesAsync();

        // Notify all dashboards about new category
        await _notificationService.NotifyCategoryChangeAsync(NotificationAction.Created, category);

        return new CategoryDto
        {
            Id = category.Id,
            Name = category.Name
        };
    }

    public async Task<CategoryDto> UpdateAsync(int id, UpdateCategoryDto dto)
    {
        var category = await _context.Categories.FindAsync(id)
            ?? throw new KeyNotFoundException("Category not found");

        category.Name = dto.Name;
        await _context.SaveChangesAsync();

        // Notify all dashboards about category update
        await _notificationService.NotifyCategoryChangeAsync(NotificationAction.Updated, category);

        return new CategoryDto
        {
            Id = category.Id,
            Name = category.Name
        };
    }

    public async Task DeleteAsync(int id)
    {
        var category = await _context.Categories
            .Include(c => c.Medicines)
            .FirstOrDefaultAsync(c => c.Id == id)
            ?? throw new KeyNotFoundException("Category not found");

        if (category.Medicines.Any())
            throw new InvalidOperationException("Cannot delete category with medicines");

        // Keep reference for notification before deletion
        var categoryForNotification = new Category { Id = category.Id, Name = category.Name };

        _context.Categories.Remove(category);
        await _context.SaveChangesAsync();

        // Notify all dashboards about category deletion
        await _notificationService.NotifyCategoryChangeAsync(NotificationAction.Deleted, categoryForNotification);
    }

    public async Task<List<CategoryDto>> GetAllAsync()
    {
        // AsNoTracking + projection for optimal read-only query
        return await _context.Categories
            .AsNoTracking()
            .Select(c => new CategoryDto
            {
                Id = c.Id,
                Name = c.Name
            })
            .ToListAsync();
    }
}
