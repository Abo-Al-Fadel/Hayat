using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests.Services;

/// <summary>
/// Unit tests for SupplierService
/// Tests CRUD operations without modifying production code
/// </summary>
public class SupplierServiceTests
{
    private PharmacyDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new PharmacyDbContext(options);
    }

    [Fact]
    public async Task GetAllAsync_ReturnsEmptyList_WhenNoSuppliers()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);

        // Act
        var result = await service.GetAllAsync();

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task CreateAsync_AddsSupplier_AndReturnsId()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var dto = new CreateSupplierDto 
        { 
            Name = "PharmaCorp",
            Phone = "123-456-7890",
            Email = "contact@pharmacorp.com"
        };

        // Act
        var id = await service.CreateAsync(dto);

        // Assert
        Assert.True(id > 0);
        var suppliers = await service.GetAllAsync();
        Assert.Single(suppliers);
        Assert.Equal("PharmaCorp", suppliers.First().Name);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsSupplier_WhenExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = await service.CreateAsync(new CreateSupplierDto 
        { 
            Name = "TestSupplier",
            Phone = "111-222-3333",
            Email = "test@supplier.com"
        });

        // Act
        var result = await service.GetByIdAsync(id);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("TestSupplier", result.Name);
        Assert.Equal("111-222-3333", result.Phone);
        Assert.Equal("test@supplier.com", result.Email);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsNull_WhenNotExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);

        // Act
        var result = await service.GetByIdAsync(999);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task UpdateAsync_UpdatesSupplier_WhenExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = await service.CreateAsync(new CreateSupplierDto 
        { 
            Name = "OldName",
            Phone = "000-000-0000",
            Email = "old@email.com"
        });

        // Act
        var result = await service.UpdateAsync(id, new UpdateSupplierDto 
        { 
            Name = "NewName",
            Phone = "999-999-9999",
            Email = "new@email.com"
        });

        // Assert
        Assert.NotNull(result);
        Assert.Equal(id, result.Id);
        Assert.Equal("NewName", result.Name);
        Assert.Equal("999-999-9999", result.Phone);
        Assert.Equal("new@email.com", result.Email);
        
        // Verify persisted
        var updated = await service.GetByIdAsync(id);
        Assert.NotNull(updated);
        Assert.Equal("NewName", updated.Name);
    }

    [Fact]
    public async Task UpdateAsync_ReturnsNull_WhenNotExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);

        // Act
        var result = await service.UpdateAsync(999, new UpdateSupplierDto { Name = "Test" });

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task UpdateAsync_UpdatesNameOnly_WhenOtherFieldsNull()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = await service.CreateAsync(new CreateSupplierDto 
        { 
            Name = "Original",
            Phone = "123-456-7890",
            Email = "original@test.com"
        });

        // Act - update only name, null for phone/email
        var result = await service.UpdateAsync(id, new UpdateSupplierDto 
        { 
            Name = "Updated",
            Phone = null,
            Email = null
        });

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Updated", result.Name);
        Assert.Null(result.Phone);
        Assert.Null(result.Email);
    }

    [Fact]
    public async Task UpdateAsync_UpdatesEmail_ValidFormat()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = await service.CreateAsync(new CreateSupplierDto 
        { 
            Name = "Supplier",
            Email = "old@email.com"
        });

        // Act
        var result = await service.UpdateAsync(id, new UpdateSupplierDto 
        { 
            Name = "Supplier",
            Email = "new@updated.org"
        });

        // Assert
        Assert.NotNull(result);
        Assert.Equal("new@updated.org", result.Email);
    }

    [Fact]
    public async Task UpdateAsync_UpdatesPhone_ValidFormat()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = await service.CreateAsync(new CreateSupplierDto 
        { 
            Name = "Supplier",
            Phone = "000-000-0000"
        });

        // Act
        var result = await service.UpdateAsync(id, new UpdateSupplierDto 
        { 
            Name = "Supplier",
            Phone = "+1 (555) 123-4567"
        });

        // Assert
        Assert.NotNull(result);
        Assert.Equal("+1 (555) 123-4567", result.Phone);
    }

    [Fact]
    public async Task DeleteAsync_RemovesSupplier_WhenExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = await service.CreateAsync(new CreateSupplierDto 
        { 
            Name = "ToDelete",
            Phone = "111-111-1111"
        });

        // Act
        var success = await service.DeleteAsync(id);

        // Assert
        Assert.True(success);
        var all = await service.GetAllAsync();
        Assert.Empty(all);
    }

    [Fact]
    public async Task DeleteAsync_ReturnsFalse_WhenNotExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);

        // Act
        var success = await service.DeleteAsync(999);

        // Assert
        Assert.False(success);
    }
}
