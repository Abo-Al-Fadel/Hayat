using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

public static class DbInitializer
{
    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

        var roles = Enum.GetNames(typeof(AppRole));

        foreach (var role in roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }
        
        // Fix existing medicines with incorrect LowStockThreshold
        // Default should be 30, not 0 or 10
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        var medicinesToFix = await context.Medicines
            .Where(m => m.LowStockThreshold < 30)
            .ToListAsync();
            
        if (medicinesToFix.Any())
        {
            foreach (var medicine in medicinesToFix)
            {
                medicine.LowStockThreshold = 30;
            }
            await context.SaveChangesAsync();
            Console.WriteLine($"[DbInit] Updated {medicinesToFix.Count} medicines to have LowStockThreshold=30");
        }
    }

}

