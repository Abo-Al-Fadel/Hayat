using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Backend.Tests.Services;

/// <summary>
/// The public demo account.
///
/// Its credentials are printed on the login page and compiled into the front-end
/// bundle, so anyone can read them. That is only defensible because the account cannot
/// change anything - and the thing that guarantees it is that the seeder hard-codes the
/// HR role rather than taking it from configuration.
///
/// These tests exist to keep that true. If someone ever makes the role a setting, or
/// lets the seeder overwrite an existing account, a published password stops being
/// harmless.
/// </summary>
public class DemoAccountSeedingTests
{
    private static ServiceProvider BuildServices(params (string Key, string Value)[] settings)
    {
        var services = new ServiceCollection();

        services.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        services.AddSingleton<IConfiguration>(
            new ConfigurationBuilder()
                .AddInMemoryCollection(settings.Select(s => new KeyValuePair<string, string?>(s.Key, s.Value)))
                .Build());

        services.AddDbContext<PharmacyDbContext>(o => o.UseInMemoryDatabase(Guid.NewGuid().ToString()));

        services.AddIdentityCore<AppUser>(o =>
            {
                // Match the app: the demo password must satisfy the real rules.
                o.Password.RequireDigit = true;
                o.Password.RequireUppercase = true;
                o.Password.RequireLowercase = true;
                o.Password.RequireNonAlphanumeric = true;
                o.Password.RequiredLength = 6;
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<PharmacyDbContext>();

        return services.BuildServiceProvider();
    }

    private static async Task<ServiceProvider> SeededAsync(params (string, string)[] settings)
    {
        var provider = BuildServices(settings);

        // The role must exist before anyone can be added to it, exactly as
        // InitializeAsync arranges in production.
        var roles = provider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in Enum.GetNames<AppRole>())
            await roles.CreateAsync(new IdentityRole(role));

        await DbInitializer.SeedDemoObserverAsync(provider);
        return provider;
    }

    private static readonly (string, string)[] Configured =
    {
        ("DemoAccount:UserName", "Hr"),
        ("DemoAccount:Password", "Hr123456!"),
        ("DemoAccount:Email", "hr@demo.local")
    };

    [Fact]
    public async Task SeedsNothingWhenNotConfigured()
    {
        // A fork, or a private deployment, must not inherit a known-password account.
        var provider = await SeededAsync();
        var users = provider.GetRequiredService<UserManager<AppUser>>();

        Assert.Empty(users.Users);
    }

    [Theory]
    [InlineData("DemoAccount:UserName")]
    [InlineData("DemoAccount:Password")]
    public async Task SeedsNothingWhenHalfConfigured(string omitted)
    {
        var partial = Configured.Where(s => s.Item1 != omitted).ToArray();
        var provider = await SeededAsync(partial);

        Assert.Empty(provider.GetRequiredService<UserManager<AppUser>>().Users);
    }

    [Fact]
    public async Task CreatesTheAccountAndItCanSignIn()
    {
        var provider = await SeededAsync(Configured);
        var users = provider.GetRequiredService<UserManager<AppUser>>();

        var demo = await users.FindByNameAsync("Hr");
        Assert.NotNull(demo);
        Assert.True(await users.CheckPasswordAsync(demo!, "Hr123456!"));
    }

    [Fact]
    public async Task TheAccountIsReadOnlyAndNothingElse()
    {
        // The load-bearing assertion of this file.
        var provider = await SeededAsync(Configured);
        var users = provider.GetRequiredService<UserManager<AppUser>>();

        var demo = await users.FindByNameAsync("Hr");
        var roles = await users.GetRolesAsync(demo!);

        Assert.Equal(new[] { nameof(AppRole.HR) }, roles);
    }

    [Fact]
    public async Task IgnoresAnyRoleSomeoneTriesToConfigure()
    {
        // The role is not a setting. Smuggling one in must change nothing.
        var provider = await SeededAsync(Configured
            .Append(("DemoAccount:Role", "Admin"))
            .Append(("DemoAccount:Roles", "Admin"))
            .ToArray());

        var users = provider.GetRequiredService<UserManager<AppUser>>();
        var roles = await users.GetRolesAsync((await users.FindByNameAsync("Hr"))!);

        Assert.Equal(new[] { nameof(AppRole.HR) }, roles);
    }

    [Fact]
    public async Task LeavesAnExistingAccountOfThatNameAlone()
    {
        // Restarting the app must not reset a password or re-grant a role an admin
        // deliberately changed.
        var provider = await SeededAsync(Configured);
        var users = provider.GetRequiredService<UserManager<AppUser>>();

        var demo = await users.FindByNameAsync("Hr");
        await users.RemoveFromRoleAsync(demo!, nameof(AppRole.HR));
        await users.AddToRoleAsync(demo!, nameof(AppRole.Pharmacist));

        await DbInitializer.SeedDemoObserverAsync(provider);

        Assert.Single(users.Users);
        var after = await users.GetRolesAsync((await users.FindByNameAsync("Hr"))!);
        Assert.Equal(new[] { nameof(AppRole.Pharmacist) }, after);
    }

    [Fact]
    public async Task RunningTwiceCreatesOneAccount()
    {
        var provider = await SeededAsync(Configured);
        await DbInitializer.SeedDemoObserverAsync(provider);

        Assert.Single(provider.GetRequiredService<UserManager<AppUser>>().Users);
    }
}
