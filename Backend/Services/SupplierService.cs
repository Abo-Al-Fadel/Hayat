using Microsoft.EntityFrameworkCore;

public class SupplierService : ISupplierService
{
    private readonly PharmacyDbContext _context;

    public SupplierService(PharmacyDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Returns the created supplier rather than just its id. A caller that only gets
    /// an id has to either re-fetch the list or invent a placeholder object - and the
    /// admin panel did the latter, appending a row whose name was undefined, which
    /// then crashed the edit form.
    /// </summary>
    public async Task<SupplierDto> CreateAsync(CreateSupplierDto dto)
    {
        var supplier = new Supplier
        {
            Name = dto.Name,
            Phone = dto.Phone,
            Email = dto.Email
        };

        _context.Suppliers.Add(supplier);
        await _context.SaveChangesAsync();

        return new SupplierDto
        {
            Id = supplier.Id,
            Name = supplier.Name,
            Phone = supplier.Phone,
            Email = supplier.Email
        };
    }

    public async Task<SupplierDto?> UpdateAsync(int id, UpdateSupplierDto dto)
    {
        var supplier = await _context.Suppliers.FindAsync(id);
        if (supplier == null)
            return null;

        supplier.Name = dto.Name;
        supplier.Phone = dto.Phone;
        supplier.Email = dto.Email;

        await _context.SaveChangesAsync();

        return new SupplierDto
        {
            Id = supplier.Id,
            Name = supplier.Name,
            Phone = supplier.Phone,
            Email = supplier.Email
        };
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var supplier = await _context.Suppliers.FindAsync(id);
        if (supplier == null)
            return false;

        _context.Suppliers.Remove(supplier);
        await _context.SaveChangesAsync();
        return true;
    }
    public async Task<List<SupplierDto>> GetAllAsync()
    {
        // AsNoTracking + projection for optimal read-only query
        return await _context.Suppliers
            .AsNoTracking()
            .Select(s => new SupplierDto
            {
                Id = s.Id,
                Name = s.Name,
                Phone = s.Phone,
                Email = s.Email
            })
            .ToListAsync();
    }

    public async Task<SupplierDto?> GetByIdAsync(int id)
    {
        // AsNoTracking + projection for optimal read-only query
        return await _context.Suppliers
            .AsNoTracking()
            .Where(s => s.Id == id)
            .Select(s => new SupplierDto
            {
                Id = s.Id,
                Name = s.Name,
                Phone = s.Phone,
                Email = s.Email
            })
            .FirstOrDefaultAsync();
    }

}
