using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests.Services;

/// <summary>
/// Timestamps must reach the browser marked as UTC.
///
/// SQL Server's datetime2 carries no time zone, so EF materialises every timestamp with
/// DateTimeKind.Unspecified. System.Text.Json writes those without a trailing "Z", and
/// JavaScript's Date parser reads an unqualified string as *local* time.
///
/// Everything here is written as DateTime.UtcNow, so the effect was to shift every
/// displayed time by the viewer's offset. In UTC+3 an order placed at 00:24 local came
/// back as 21:24 the previous day - the wrong time, and on the order calendar, the wrong
/// day. It only appeared between midnight and 03:00, which is why it went unnoticed.
///
/// PharmacyDbContext.ConfigureConventions stamps the Kind on read. These tests fail if
/// that convention is removed, or if a new entity somehow escapes it.
/// </summary>
public class TimestampKindTests
{
    private static PharmacyDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static IEnumerable<(string Entity, string Property, Func<object?, object?> FromProvider)> DateTimeProperties()
    {
        using var context = CreateContext();

        foreach (var entity in context.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                var type = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
                if (type != typeof(DateTime)) continue;

                var converter = property.GetValueConverter();
                yield return (
                    entity.ShortName(),
                    property.Name,
                    converter is null ? v => v : converter.ConvertFromProvider);
            }
        }
    }

    [Fact]
    public void EveryTimestampInTheModelIsReadBackAsUtc()
    {
        // Kind.Unspecified is exactly what the database hands back.
        var fromDatabase = new DateTime(2026, 8, 2, 21, 24, 42, DateTimeKind.Unspecified);

        var unconverted = DateTimeProperties()
            .Where(p => ((DateTime?)p.FromProvider(fromDatabase))?.Kind != DateTimeKind.Utc)
            .Select(p => $"{p.Entity}.{p.Property}")
            .ToList();

        Assert.True(unconverted.Count == 0,
            "these timestamps come back without a UTC marker, so the browser will read " +
            "them as local time:\n  " + string.Join("\n  ", unconverted));
    }

    [Fact]
    public void TheModelActuallyHasTimestampsToCheck()
    {
        // A guard on the guard: if the model stops exposing DateTime properties, the
        // test above passes over an empty set.
        Assert.True(DateTimeProperties().Count() > 5,
            $"only found {DateTimeProperties().Count()} timestamp properties");
    }

    [Theory]
    [InlineData(DateTimeKind.Utc, true)]
    [InlineData(DateTimeKind.Unspecified, false)]
    public void OnlyAUtcKindSerialisesWithTheZSuffix(DateTimeKind kind, bool expectsZ)
    {
        // Documents why the convention matters at all: the Kind is the only thing that
        // decides whether the wire format is unambiguous.
        var json = JsonSerializer.Serialize(new DateTime(2026, 8, 2, 21, 24, 42, kind));

        Assert.Equal(expectsZ, json.TrimEnd('"').EndsWith("Z", StringComparison.Ordinal));
    }
}
