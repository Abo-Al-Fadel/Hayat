using Hayaa.Backend.Models;

public interface INotificationManagerService
{
    Task<IEnumerable<Notification>> GetAsync(string? role, bool unreadOnly, int take);
    Task<bool> MarkReadAsync(int[] ids);
    Task<bool> MarkAllReadAsync(string role);
    Task<bool> DeleteAsync(int id);
}
