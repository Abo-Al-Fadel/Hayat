using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Backend.Tests.Services;

/// <summary>
/// Guards the transient-failure handling on the database connection.
///
/// A serverless Azure SQL database pauses when idle and refuses connections with
/// error 40613 for up to a minute while it resumes. Without retries the first request
/// after an idle period fails outright, and because migrations run at start-up the
/// whole application dies instead of starting - which is exactly how the first
/// deployment failed.
///
/// This is configuration, so nothing in the app's own behaviour reveals it is missing
/// until it is running against a real hosted database. Hence a test.
/// </summary>
public class DatabaseResilienceTests
{
    private static ServiceProvider BuildProvider()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Never connected to - only the provider configuration is under test.
                ["ConnectionStrings:DefaultConnection"] =
                    "Server=tcp:nowhere.database.windows.net,1433;Initial Catalog=none;User ID=u;Password=p;Encrypt=True;"
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApplicationServices(config);
        return services.BuildServiceProvider();
    }

    [Fact]
    public void DbContext_RetriesOnTransientFailure()
    {
        using var provider = BuildProvider();
        using var scope = provider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        var strategy = context.Database.CreateExecutionStrategy();

        Assert.True(
            strategy.RetriesOnFailure,
            "EnableRetryOnFailure must stay configured: without it a paused serverless " +
            "database takes the whole application down at start-up.");
    }

    [Fact]
    public void DbContext_UsesTheSqlServerRetryingStrategy()
    {
        using var provider = BuildProvider();
        using var scope = provider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        // The SQL Server strategy is what knows 40613 and its siblings are transient.
        Assert.IsType<SqlServerRetryingExecutionStrategy>(context.Database.CreateExecutionStrategy());
    }

    [Fact]
    public void CommandTimeout_SurvivesADatabaseResume()
    {
        using var provider = BuildProvider();
        using var scope = provider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        // A resuming database can leave a command waiting well past the 30s default.
        var timeout = context.Database.GetCommandTimeout();
        Assert.NotNull(timeout);
        Assert.True(timeout >= 60, $"command timeout was {timeout}s, expected at least 60s");
    }
}
