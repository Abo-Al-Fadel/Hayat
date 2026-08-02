using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

public static class DbInitializer
{
    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DbInitializer");

        // Bring the schema up to date before anything touches it. A hosted database
        // cannot easily be reached with `dotnet ef database update`, and a schema left
        // a migration behind fails at read time with an unhelpful "failed to load"
        // rather than at start-up. EF takes an advisory lock, so a restart during a
        // migration is safe.
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        var pending = (await context.Database.GetPendingMigrationsAsync()).ToList();
        if (pending.Count > 0)
        {
            logger.LogInformation("Applying {Count} pending migration(s): {Migrations}",
                pending.Count, string.Join(", ", pending));
            await context.Database.MigrateAsync();
        }

        var roles = Enum.GetNames<AppRole>();

        foreach (var role in roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
        }

        // NOTE: LowStockThreshold is backfilled once by the
        // BackfillLowStockThresholdDefault migration. It is deliberately NOT re-applied
        // on every start - doing so silently reverted any per-medicine threshold an
        // Admin set below 30 on the next restart.

        await SeedBootstrapAdminAsync(scope.ServiceProvider);
    }

    /// <summary>
    /// Creates the first Admin on an otherwise empty database. Every user-management
    /// endpoint requires an existing Admin, so without this a fresh deployment has no
    /// way in.
    ///
    /// Opt-in only: nothing happens unless BootstrapAdmin:UserName / :Email / :Password
    /// are all configured, and nothing happens if any user already exists. There are no
    /// built-in default credentials.
    /// </summary>
    private static async Task SeedBootstrapAdminAsync(IServiceProvider services)
    {
        var config = services.GetRequiredService<IConfiguration>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("DbInitializer");

        var userName = config["BootstrapAdmin:UserName"];
        var email = config["BootstrapAdmin:Email"];
        var password = config["BootstrapAdmin:Password"];

        if (string.IsNullOrWhiteSpace(userName) ||
            string.IsNullOrWhiteSpace(email) ||
            string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        var userManager = services.GetRequiredService<UserManager<AppUser>>();

        if (userManager.Users.Any())
        {
            logger.LogInformation("[DbInit] Users already exist - skipping bootstrap admin.");
            return;
        }

        var admin = new AppUser { UserName = userName, Email = email, EmailConfirmed = true };
        var result = await userManager.CreateAsync(admin, password);

        if (!result.Succeeded)
        {
            logger.LogError("[DbInit] Bootstrap admin creation failed: {Errors}",
                string.Join("; ", result.Errors.Select(e => e.Description)));
            return;
        }

        await userManager.AddToRoleAsync(admin, nameof(AppRole.Admin));
        logger.LogWarning("[DbInit] Bootstrap Admin '{UserName}' created. Change this password immediately.", userName);
    }
}
