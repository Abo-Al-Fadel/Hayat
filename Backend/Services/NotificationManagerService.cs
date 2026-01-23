using Hayaa.Backend.Models;
using Microsoft.EntityFrameworkCore;

public class NotificationManagerService : INotificationManagerService
{
    private readonly PharmacyDbContext _context;

    public NotificationManagerService(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Notification>> GetAsync(
        string? role,
        bool unreadOnly,
        int take)
    {
        var query = _context.Notifications.AsQueryable();

        if (!string.IsNullOrWhiteSpace(role))
            query = query.Where(n => n.TargetRole == role);

        if (unreadOnly)
            query = query.Where(n => !n.IsRead);

        return await query
            .OrderByDescending(n => n.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .ToListAsync();
    }

    public async Task<bool> MarkReadAsync(int[] ids)
    {
        var items = await _context.Notifications
            .Where(n => ids.Contains(n.Id))
            .ToListAsync();

        if (!items.Any()) return false;

        foreach (var n in items)
            n.IsRead = true;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> MarkAllReadAsync(string role)
    {
        var items = await _context.Notifications
            .Where(n => n.TargetRole == role && !n.IsRead)
            .ToListAsync();

        if (!items.Any()) return false;

        foreach (var n in items)
            n.IsRead = true;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var n = await _context.Notifications.FindAsync(id);
        if (n == null) return false;

        _context.Notifications.Remove(n);
        await _context.SaveChangesAsync();
        return true;
    }
}
