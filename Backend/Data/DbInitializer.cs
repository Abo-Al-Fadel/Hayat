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
        await SeedDemoObserverAsync(scope.ServiceProvider);
    }

    /// <summary>
    /// Creates the public demo account: a portfolio visitor signs in with published
    /// credentials and looks around without an admin handing out a password.
    ///
    /// Two properties make publishing those credentials defensible, and both are
    /// enforced here rather than left to configuration:
    ///
    /// 1. The role is hard-coded to HR. It is not a setting, so this can never seed an
    ///    account that writes. HR is refused by every write endpoint on the server, and
    ///    RoleAuthorizationTests walks each one to prove it.
    /// 2. Nothing happens unless DemoAccount:UserName and :Password are both configured.
    ///    There are no built-in credentials, so a fork or a private deployment that does
    ///    not set them has no demo account at all.
    ///
    /// Idempotent: an existing user of that name is left exactly as it is, so this never
    /// resets a password or re-grants a role someone deliberately changed.
    /// </summary>
    internal static async Task SeedDemoObserverAsync(IServiceProvider services)
    {
        var config = services.GetRequiredService<IConfiguration>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("DbInitializer");

        var userName = config["DemoAccount:UserName"];
        var password = config["DemoAccount:Password"];
        var email = config["DemoAccount:Email"];

        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(password))
            return;

        var userManager = services.GetRequiredService<UserManager<AppUser>>();

        if (await userManager.FindByNameAsync(userName) is not null)
        {
            logger.LogInformation("[DbInit] Demo account '{UserName}' already exists.", userName);
            return;
        }

        var demo = new AppUser
        {
            UserName = userName,
            Email = string.IsNullOrWhiteSpace(email) ? $"{userName}@demo.local" : email,
            EmailConfirmed = true
        };

        var result = await userManager.CreateAsync(demo, password);
        if (!result.Succeeded)
        {
            logger.LogError("[DbInit] Demo account creation failed: {Errors}",
                string.Join("; ", result.Errors.Select(e => e.Description)));
            return;
        }

        // Never anything but HR. See the note above.
        await userManager.AddToRoleAsync(demo, nameof(AppRole.HR));
        logger.LogInformation(
            "[DbInit] Demo account '{UserName}' created as read-only {Role}.",
            userName, nameof(AppRole.HR));
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
