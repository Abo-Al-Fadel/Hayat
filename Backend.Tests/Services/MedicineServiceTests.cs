using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using AutoMapper;
using Backend.Services;
using Hayat.Backend.Configurations;
using Hayat.Backend.Dtos.Medicine;
using Microsoft.Extensions.Options;

namespace Backend.Tests.Services;

/// <summary>
/// Unit tests for MedicineService - specifically testing UpdateNameAsync method
/// </summary>
public class MedicineServiceTests
{
    private static PharmacyDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new PharmacyDbContext(options);
    }

    private static IMapper CreateMapper()
    {
        // AutoMapper 15 requires an ILoggerFactory on MapperConfiguration.
        var config = new MapperConfiguration(cfg =>
        {
            cfg.CreateMap<Medicine, MedicineDto>();
        }, NullLoggerFactory.Instance);
        return config.CreateMapper();
    }

    private static MedicineService CreateService(
        PharmacyDbContext context,
        INotificationService? notificationService = null,
        IMapper? mapper = null)
    {
        return new MedicineService(
            context,
            notificationService ?? Mock.Of<INotificationService>(),
            Mock.Of<ILogger<MedicineService>>(),
            mapper ?? CreateMapper(),
            CreatePricingService()
        );
    }

    private static PricingService CreatePricingService()
    {
        return new PricingService(Options.Create(new PricingSettings
        {
            MarkupTiers = new List<MarkupTier> { new() { UpToCost = 1000m, MarkupPercent = 20m } },
            DefaultMarkupPercent = 10m
        }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UpdateNameAsync Tests
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateNameAsync_ShouldUpdateName_WhenValidNameProvided()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var medicine = new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 };
        context.Medicines.Add(medicine);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act
        var result = await service.UpdateNameAsync(1, "Ibuprofen");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Ibuprofen", result.Name);
        Assert.Equal(5.99m, result.Price); // Price unchanged
        Assert.Equal(100, result.Quantity); // Quantity unchanged
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldTrimWhitespace()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var medicine = new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 };
        context.Medicines.Add(medicine);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act
        var result = await service.UpdateNameAsync(1, "  Ibuprofen  ");

        // Assert
        Assert.Equal("Ibuprofen", result.Name);
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldThrowKeyNotFoundException_WhenMedicineNotFound()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = CreateService(context);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => service.UpdateNameAsync(999, "New Name")
        );
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task UpdateNameAsync_ShouldThrowArgumentException_WhenNameIsEmpty(string? invalidName)
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var medicine = new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 };
        context.Medicines.Add(medicine);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => service.UpdateNameAsync(1, invalidName!)
        );
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldThrowInvalidOperationException_WhenDuplicateNameExists()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        context.Medicines.AddRange(
            new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 },
            new Medicine { Id = 2, Name = "Ibuprofen", Price = 8.99m, Quantity = 50 }
        );
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act & Assert
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.UpdateNameAsync(1, "Ibuprofen")
        );
        Assert.Contains("already exists", ex.Message);
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldThrowInvalidOperationException_WhenDuplicateNameCaseInsensitive()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        context.Medicines.AddRange(
            new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 },
            new Medicine { Id = 2, Name = "Ibuprofen", Price = 8.99m, Quantity = 50 }
        );
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act & Assert - case insensitive check
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.UpdateNameAsync(1, "IBUPROFEN")
        );
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldAllowSameName_ForSameMedicine()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var medicine = new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 };
        context.Medicines.Add(medicine);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act - Update to same name (should work, no duplicate check against itself)
        var result = await service.UpdateNameAsync(1, "Aspirin");

        // Assert
        Assert.Equal("Aspirin", result.Name);
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldCallNotificationService()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var medicine = new Medicine { Id = 1, Name = "Aspirin", Price = 5.99m, Quantity = 100 };
        context.Medicines.Add(medicine);
        await context.SaveChangesAsync();

        var mockNotificationService = new Mock<INotificationService>();
        var service = CreateService(context, mockNotificationService.Object);

        // Act
        await service.UpdateNameAsync(1, "Ibuprofen");

        // Assert - notification was sent
        mockNotificationService.Verify(
            x => x.NotifyMedicineChangeAsync(
                NotificationAction.Updated,
                It.Is<Medicine>(m => m.Name == "Ibuprofen"),
                AppRole.Admin
            ),
            Times.Once
        );
    }

    [Fact]
    public async Task UpdateNameAsync_ShouldPreserveAllOtherFields()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var medicine = new Medicine
        {
            Id = 1,
            Name = "Aspirin",
            Price = 5.99m,
            Quantity = 100,
            Image = "/images/aspirin.jpg",
            CategoryId = 5,
            IsHidden = true,
            LowStockThreshold = 25
        };
        context.Medicines.Add(medicine);
        await context.SaveChangesAsync();

        var service = CreateService(context);

        // Act
        var result = await service.UpdateNameAsync(1, "New Aspirin");

        // Assert - only name changed, all other fields preserved
        Assert.Equal("New Aspirin", result.Name);
        Assert.Equal(5.99m, result.Price);
        Assert.Equal(100, result.Quantity);
        Assert.Equal("/images/aspirin.jpg", result.Image);
        Assert.Equal(5, result.CategoryId);
        Assert.True(result.IsHidden);

        // Verify in database
        var dbMedicine = await context.Medicines.FindAsync(1);
        Assert.Equal(25, dbMedicine!.LowStockThreshold);
    }
}
