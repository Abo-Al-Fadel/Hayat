using Hayat.Backend.Models;

public interface INotificationManagerService
{
    Task<IEnumerable<Notification>> GetAsync(string? role, bool unreadOnly, int take);

    /// <summary>Marks notifications read. Only rows targeted at <paramref name="callerRole"/> are affected.</summary>
    Task<bool> MarkReadAsync(int[] ids, string callerRole);

    Task<bool> MarkAllReadAsync(string role);

    /// <summary>Deletes a notification only if it is targeted at <paramref name="callerRole"/>.</summary>
    Task<bool> DeleteAsync(int id, string callerRole);
}
