using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests.Services;

/// <summary>
/// Unit tests for NotificationManagerService
/// Tests notification CRUD and read status operations
/// </summary>
public class NotificationManagerServiceTests
{
    private PharmacyDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new PharmacyDbContext(options);
    }

    [Fact]
    public async Task GetAsync_ReturnsEmptyList_WhenNoNotifications()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new NotificationManagerService(context);

        // Act
        var result = await service.GetAsync(null, false, 50);

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetAsync_FiltersByRole_WhenRoleProvided()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        context.Notifications.AddRange(
            new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "Admin msg", Action = NotificationAction.Created },
            new Hayaa.Backend.Models.Notification { TargetRole = "Pharmacist", Message = "Pharmacist msg", Action = NotificationAction.Updated }
        );
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var adminNotifs = await service.GetAsync("Admin", false, 50);
        var pharmacistNotifs = await service.GetAsync("Pharmacist", false, 50);

        // Assert
        Assert.Single(adminNotifs);
        Assert.Equal("Admin msg", adminNotifs.First().Message);
        Assert.Single(pharmacistNotifs);
        Assert.Equal("Pharmacist msg", pharmacistNotifs.First().Message);
    }

    [Fact]
    public async Task GetAsync_FiltersUnreadOnly_WhenRequested()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        context.Notifications.AddRange(
            new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "Read", IsRead = true, Action = NotificationAction.Created },
            new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "Unread", IsRead = false, Action = NotificationAction.Updated }
        );
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var unreadOnly = await service.GetAsync("Admin", true, 50);
        var all = await service.GetAsync("Admin", false, 50);

        // Assert
        Assert.Single(unreadOnly);
        Assert.Equal("Unread", unreadOnly.First().Message);
        Assert.Equal(2, all.Count());
    }

    [Fact]
    public async Task GetAsync_RespectsMaxTake_WhenLimited()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        for (int i = 0; i < 10; i++)
        {
            context.Notifications.Add(new Hayaa.Backend.Models.Notification 
            { 
                TargetRole = "Admin", 
                Message = $"Msg {i}",
                Action = NotificationAction.Created
            });
        }
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var result = await service.GetAsync("Admin", false, 3);

        // Assert
        Assert.Equal(3, result.Count());
    }

    [Fact]
    public async Task MarkReadAsync_MarksNotificationsAsRead_WhenExist()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var notif1 = new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "Msg1", IsRead = false, Action = NotificationAction.Created };
        var notif2 = new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "Msg2", IsRead = false, Action = NotificationAction.Updated };
        context.Notifications.AddRange(notif1, notif2);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.MarkReadAsync(new[] { notif1.Id, notif2.Id });

        // Assert
        Assert.True(success);
        var unread = await service.GetAsync("Admin", true, 50);
        Assert.Empty(unread);
    }

    [Fact]
    public async Task MarkReadAsync_ReturnsFalse_WhenNoMatchingIds()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.MarkReadAsync(new[] { 999, 1000 });

        // Assert
        Assert.False(success);
    }

    [Fact]
    public async Task MarkAllReadAsync_MarksAllForRole_WhenExist()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        context.Notifications.AddRange(
            new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "A1", IsRead = false, Action = NotificationAction.Created },
            new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "A2", IsRead = false, Action = NotificationAction.Updated },
            new Hayaa.Backend.Models.Notification { TargetRole = "Pharmacist", Message = "P1", IsRead = false, Action = NotificationAction.Deleted }
        );
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.MarkAllReadAsync("Admin");

        // Assert
        Assert.True(success);
        var adminUnread = await service.GetAsync("Admin", true, 50);
        var pharmacistUnread = await service.GetAsync("Pharmacist", true, 50);
        Assert.Empty(adminUnread);
        Assert.Single(pharmacistUnread); // Pharmacist notifications unchanged
    }

    [Fact]
    public async Task DeleteAsync_RemovesNotification_WhenExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var notif = new Hayaa.Backend.Models.Notification { TargetRole = "Admin", Message = "ToDelete", Action = NotificationAction.Created };
        context.Notifications.Add(notif);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.DeleteAsync(notif.Id);

        // Assert
        Assert.True(success);
        var all = await service.GetAsync("Admin", false, 50);
        Assert.Empty(all);
    }

    [Fact]
    public async Task DeleteAsync_ReturnsFalse_WhenNotExists()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.DeleteAsync(999);

        // Assert
        Assert.False(success);
    }
}
