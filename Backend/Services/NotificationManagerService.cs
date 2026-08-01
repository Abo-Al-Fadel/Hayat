using Hayat.Backend.Models;
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
        // AsNoTracking for read-only listing (better performance)
        var query = _context.Notifications.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(role))
            query = query.Where(n => n.TargetRole == role);

        if (unreadOnly)
            query = query.Where(n => !n.IsRead);

        return await query
            .OrderByDescending(n => n.CreatedAt)
            .Take(Math.Clamp(take, 1, 100))
            .ToListAsync();
    }

    public async Task<bool> MarkReadAsync(int[] ids, string callerRole)
    {
        if (ids == null || ids.Length == 0 || string.IsNullOrWhiteSpace(callerRole))
            return false;

        // Scope to the caller's own role: without this any authenticated user could
        // mark another role's notifications read by guessing ids.
        var items = await _context.Notifications
            .Where(n => ids.Contains(n.Id) && n.TargetRole == callerRole)
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

    public async Task<bool> DeleteAsync(int id, string callerRole)
    {
        if (string.IsNullOrWhiteSpace(callerRole)) return false;

        // Scope to the caller's own role - see MarkReadAsync.
        var n = await _context.Notifications
            .FirstOrDefaultAsync(x => x.Id == id && x.TargetRole == callerRole);
        if (n == null) return false;

        _context.Notifications.Remove(n);
        await _context.SaveChangesAsync();
        return true;
    }
}
