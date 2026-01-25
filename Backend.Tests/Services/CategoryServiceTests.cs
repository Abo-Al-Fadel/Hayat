using Backend.Services;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace Backend.Tests.Services;

/// <summary>
/// Unit tests for CategoryService
/// Tests CRUD operations and verifies SignalR notifications are sent
/// </summary>
public class CategoryServiceTests
{
    private PharmacyDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new PharmacyDbContext(options);
    }

    private static CategoryService CreateService(PharmacyDbContext context, INotificationService? notificationService = null)
    {
        return new CategoryService(context, notificationService ?? Mock.Of<INotificationService>());
    }

    [Fact]
    public async Task GetAllAsync_ReturnsEmptyList_WhenNoCategories()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);

        // Act
        var result = await service.GetAllAsync();

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task CreateAsync_AddsCategory_AndReturnsDto()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);
        var dto = new CreateCategoryDto { Name = "Antibiotics" };

        // Act
        var result = await service.CreateAsync(dto);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Antibiotics", result.Name);
        Assert.True(result.Id > 0);
    }

    [Fact]
    public async Task CreateAsync_ThrowsException_WhenDuplicateName()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);
        await service.CreateAsync(new CreateCategoryDto { Name = "Vitamins" });

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.CreateAsync(new CreateCategoryDto { Name = "Vitamins" }));
    }

    [Fact]
    public async Task CreateAsync_SendsNotification()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var mockNotificationService = new Mock<INotificationService>();
        var service = CreateService(context, mockNotificationService.Object);

        // Act
        await service.CreateAsync(new CreateCategoryDto { Name = "TestCategory" });

        // Assert
        mockNotificationService.Verify(
            x => x.NotifyCategoryChangeAsync(
                NotificationAction.Created,
                It.Is<Category>(c => c.Name == "TestCategory")
            ),
            Times.Once
        );
    }

    [Fact]
    public async Task UpdateAsync_UpdatesCategory_WhenExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);
        var created = await service.CreateAsync(new CreateCategoryDto { Name = "OldName" });

        // Act
        var result = await service.UpdateAsync(created.Id, new UpdateCategoryDto { Name = "NewName" });

        // Assert
        Assert.Equal("NewName", result.Name);
        Assert.Equal(created.Id, result.Id);
    }

    [Fact]
    public async Task UpdateAsync_ThrowsKeyNotFoundException_WhenNotExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => service.UpdateAsync(999, new UpdateCategoryDto { Name = "Test" }));
    }

    [Fact]
    public async Task UpdateAsync_SendsNotification()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var mockNotificationService = new Mock<INotificationService>();
        var service = CreateService(context, mockNotificationService.Object);
        var created = await service.CreateAsync(new CreateCategoryDto { Name = "Original" });
        mockNotificationService.Reset();

        // Act
        await service.UpdateAsync(created.Id, new UpdateCategoryDto { Name = "Updated" });

        // Assert
        mockNotificationService.Verify(
            x => x.NotifyCategoryChangeAsync(
                NotificationAction.Updated,
                It.Is<Category>(c => c.Name == "Updated")
            ),
            Times.Once
        );
    }

    [Fact]
    public async Task DeleteAsync_RemovesCategory_WhenNoMedicines()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);
        var created = await service.CreateAsync(new CreateCategoryDto { Name = "ToDelete" });

        // Act
        await service.DeleteAsync(created.Id);
        var all = await service.GetAllAsync();

        // Assert
        Assert.Empty(all);
    }

    [Fact]
    public async Task DeleteAsync_ThrowsKeyNotFoundException_WhenNotExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(
            () => service.DeleteAsync(999));
    }

    [Fact]
    public async Task DeleteAsync_ThrowsInvalidOperationException_WhenHasMedicines()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = CreateService(context);
        var category = await service.CreateAsync(new CreateCategoryDto { Name = "WithMeds" });
        
        // Add a medicine to the category
        context.Medicines.Add(new Medicine { Name = "TestMed", Price = 10, Quantity = 5, CategoryId = category.Id });
        await context.SaveChangesAsync();

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.DeleteAsync(category.Id));
    }

    [Fact]
    public async Task DeleteAsync_SendsNotification()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var mockNotificationService = new Mock<INotificationService>();
        var service = CreateService(context, mockNotificationService.Object);
        var created = await service.CreateAsync(new CreateCategoryDto { Name = "ToDelete" });
        var categoryId = created.Id;
        mockNotificationService.Reset();

        // Act
        await service.DeleteAsync(categoryId);

        // Assert
        mockNotificationService.Verify(
            x => x.NotifyCategoryChangeAsync(
                NotificationAction.Deleted,
                It.Is<Category>(c => c.Id == categoryId && c.Name == "ToDelete")
            ),
            Times.Once
        );
    }
}
