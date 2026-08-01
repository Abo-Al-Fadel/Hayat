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
            new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "Admin msg", Action = NotificationAction.Created },
            new Hayat.Backend.Models.Notification { TargetRole = "Pharmacist", Message = "Pharmacist msg", Action = NotificationAction.Updated }
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
            new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "Read", IsRead = true, Action = NotificationAction.Created },
            new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "Unread", IsRead = false, Action = NotificationAction.Updated }
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
            context.Notifications.Add(new Hayat.Backend.Models.Notification
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
        var notif1 = new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "Msg1", IsRead = false, Action = NotificationAction.Created };
        var notif2 = new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "Msg2", IsRead = false, Action = NotificationAction.Updated };
        context.Notifications.AddRange(notif1, notif2);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.MarkReadAsync(new[] { notif1.Id, notif2.Id }, "Admin");

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
        var success = await service.MarkReadAsync(new[] { 999, 1000 }, "Admin");

        // Assert
        Assert.False(success);
    }

    [Fact]
    public async Task MarkAllReadAsync_MarksAllForRole_WhenExist()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        context.Notifications.AddRange(
            new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "A1", IsRead = false, Action = NotificationAction.Created },
            new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "A2", IsRead = false, Action = NotificationAction.Updated },
            new Hayat.Backend.Models.Notification { TargetRole = "Pharmacist", Message = "P1", IsRead = false, Action = NotificationAction.Deleted }
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
        var notif = new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "ToDelete", Action = NotificationAction.Created };
        context.Notifications.Add(notif);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.DeleteAsync(notif.Id, "Admin");

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
        var success = await service.DeleteAsync(999, "Admin");

        // Assert
        Assert.False(success);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cross-role scoping: mutations must only touch the caller's own role.
    // ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task MarkReadAsync_DoesNotTouchOtherRolesNotifications()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var adminNotif = new Hayat.Backend.Models.Notification
        {
            TargetRole = "Admin",
            Message = "Admin only",
            IsRead = false,
            Action = NotificationAction.Created
        };
        context.Notifications.Add(adminNotif);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act - a StorageManager tries to mark an Admin notification read
        var success = await service.MarkReadAsync(new[] { adminNotif.Id }, "StorageManager");

        // Assert
        Assert.False(success);
        Assert.False((await context.Notifications.FindAsync(adminNotif.Id))!.IsRead);
    }

    [Fact]
    public async Task MarkReadAsync_OnlyMarksCallersOwnRole_WhenIdsSpanRoles()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var adminNotif = new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "A", IsRead = false, Action = NotificationAction.Created };
        var pharmNotif = new Hayat.Backend.Models.Notification { TargetRole = "Pharmacist", Message = "P", IsRead = false, Action = NotificationAction.Created };
        context.Notifications.AddRange(adminNotif, pharmNotif);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.MarkReadAsync(new[] { adminNotif.Id, pharmNotif.Id }, "Pharmacist");

        // Assert
        Assert.True(success);
        Assert.False((await context.Notifications.FindAsync(adminNotif.Id))!.IsRead);
        Assert.True((await context.Notifications.FindAsync(pharmNotif.Id))!.IsRead);
    }

    [Fact]
    public async Task DeleteAsync_DoesNotDeleteOtherRolesNotification()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var adminNotif = new Hayat.Backend.Models.Notification
        {
            TargetRole = "Admin",
            Message = "Admin only",
            Action = NotificationAction.Created
        };
        context.Notifications.Add(adminNotif);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.DeleteAsync(adminNotif.Id, "Pharmacist");

        // Assert
        Assert.False(success);
        Assert.NotNull(await context.Notifications.FindAsync(adminNotif.Id));
    }

    [Fact]
    public async Task MarkReadAsync_ReturnsFalse_WhenCallerRoleMissing()
    {
        // Arrange
        using var context = CreateInMemoryContext();
        var notif = new Hayat.Backend.Models.Notification { TargetRole = "Admin", Message = "A", IsRead = false, Action = NotificationAction.Created };
        context.Notifications.Add(notif);
        await context.SaveChangesAsync();
        var service = new NotificationManagerService(context);

        // Act
        var success = await service.MarkReadAsync(new[] { notif.Id }, "");

        // Assert
        Assert.False(success);
        Assert.False((await context.Notifications.FindAsync(notif.Id))!.IsRead);
    }
}
