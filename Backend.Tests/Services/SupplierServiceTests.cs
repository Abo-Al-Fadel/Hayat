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

    /// <summary>
    /// The client adds the response straight to its list without re-fetching, so every
    /// field has to come back. Returning only the id left the new row with an undefined
    /// name, and opening it for editing took the whole admin page down.
    /// </summary>
    [Fact]
    public async Task CreateAsync_ReturnsTheWholeSupplier_NotJustItsId()
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
        var created = await service.CreateAsync(dto);

        // Assert
        Assert.True(created.Id > 0);
        Assert.Equal("PharmaCorp", created.Name);
        Assert.Equal("123-456-7890", created.Phone);
        Assert.Equal("contact@pharmacorp.com", created.Email);

        var suppliers = await service.GetAllAsync();
        Assert.Single(suppliers);
        Assert.Equal("PharmaCorp", suppliers.First().Name);
    }

    [Fact]
    public async Task CreateAsync_ReturnsTheSameShapeAsGetAll()
    {
        // A row added from the create response must be indistinguishable from one that
        // arrived via a page refresh - otherwise behaviour depends on whether the user
        // reloaded, which is how the original bug hid.
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);

        var created = await service.CreateAsync(new CreateSupplierDto
        {
            Name = "Refresh Test",
            Phone = "555-000-1111",
            Email = "refresh@test.com"
        });

        var fetched = (await service.GetAllAsync()).Single();

        Assert.Equal(fetched.Id, created.Id);
        Assert.Equal(fetched.Name, created.Name);
        Assert.Equal(fetched.Phone, created.Phone);
        Assert.Equal(fetched.Email, created.Email);
    }

    [Fact]
    public async Task CreateAsync_ReturnsNameAndNulls_WhenOptionalFieldsAreOmitted()
    {
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);

        var created = await service.CreateAsync(new CreateSupplierDto { Name = "Minimal" });

        Assert.Equal("Minimal", created.Name);
        Assert.Null(created.Phone);
        Assert.Null(created.Email);
    }

    [Fact]
    public async Task GetByIdAsync_ReturnsSupplier_WhenExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new SupplierService(context);
        var id = (await service.CreateAsync(new CreateSupplierDto
        {
            Name = "TestSupplier",
            Phone = "111-222-3333",
            Email = "test@supplier.com"
        })).Id;

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
        var id = (await service.CreateAsync(new CreateSupplierDto
        {
            Name = "OldName",
            Phone = "000-000-0000",
            Email = "old@email.com"
        })).Id;

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
        var id = (await service.CreateAsync(new CreateSupplierDto
        {
            Name = "Original",
            Phone = "123-456-7890",
            Email = "original@test.com"
        })).Id;

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
        var id = (await service.CreateAsync(new CreateSupplierDto
        {
            Name = "Supplier",
            Email = "old@email.com"
        })).Id;

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
        var id = (await service.CreateAsync(new CreateSupplierDto
        {
            Name = "Supplier",
            Phone = "000-000-0000"
        })).Id;

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
        var id = (await service.CreateAsync(new CreateSupplierDto
        {
            Name = "ToDelete",
            Phone = "111-111-1111"
        })).Id;

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
