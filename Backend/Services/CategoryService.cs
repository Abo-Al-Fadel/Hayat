using Microsoft.EntityFrameworkCore;

public class CategoryService : ICategoryService
{
    private readonly PharmacyDbContext _context;

    public CategoryService(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<CategoryDto> CreateAsync(CreateCategoryDto dto)
    {
        if (await _context.Categories.AnyAsync(c => c.Name == dto.Name))
            throw new InvalidOperationException("Category already exists");

        var category = new Category { Name = dto.Name };

        _context.Categories.Add(category);
        await _context.SaveChangesAsync();

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

        _context.Categories.Remove(category);
        await _context.SaveChangesAsync();
    }

    public async Task<List<CategoryDto>> GetAllAsync()
    {
        return await _context.Categories
            .Select(c => new CategoryDto
            {
                Id = c.Id,
                Name = c.Name
            })
            .ToListAsync();
    }
}
