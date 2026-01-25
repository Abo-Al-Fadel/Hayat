using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs
{
    [Authorize]
    public class NotificationsHub : Hub
    {
        // Thread-safe dictionary: userId => List of connectionIds
        // This allows multiple tabs/browsers for the same user
        private static readonly ConcurrentDictionary<string, HashSet<string>> UserConnections = new();
        
        // Reverse lookup: connectionId => userId (for efficient OnDisconnectedAsync)
        private static readonly ConcurrentDictionary<string, string> ConnectionToUser = new();

        // Valid roles for SignalR groups
        private static readonly HashSet<string> ValidRoles = new(StringComparer.OrdinalIgnoreCase) 
        { 
            "Admin", "Pharmacist", "StorageManager" 
        };

        public override async Task OnConnectedAsync()
        {
            var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                      ?? Context.User?.FindFirst("sub")?.Value
                      ?? Context.User?.Identity?.Name;
            
            // SECURITY: Reject connection if no valid user identity
            if (string.IsNullOrEmpty(userId))
            {
                Console.WriteLine("[SignalR] REJECTED: No user identity in token");
                Context.Abort();
                return;
            }
            
            var connectionId = Context.ConnectionId;
            
            // Track this connection for the user
            UserConnections.AddOrUpdate(
                userId,
                _ => new HashSet<string> { connectionId },
                (_, connections) => { connections.Add(connectionId); return connections; }
            );
            ConnectionToUser[connectionId] = userId;
            
            // Add to role-based groups for broadcasting
            var roles = Context.User?.Claims
                .Where(c => c.Type == ClaimTypes.Role || c.Type == "role")
                .Select(c => c.Value)
                .Where(r => ValidRoles.Contains(r)) // Only allow valid roles
                .Distinct()
                .ToList() ?? new List<string>();

            // SECURITY: Reject if no valid roles
            if (roles.Count == 0)
            {
                Console.WriteLine($"[SignalR] REJECTED: User '{userId}' has no valid roles");
                Context.Abort();
                return;
            }

            Console.WriteLine($"[SignalR] User '{userId}' connected, roles: [{string.Join(", ", roles)}]");

            foreach (var role in roles)
            {
                await Groups.AddToGroupAsync(connectionId, role);
            }
            
            // User-specific group
            await Groups.AddToGroupAsync(connectionId, $"user_{userId}");

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var connectionId = Context.ConnectionId;
            
            // Remove this specific connection
            if (ConnectionToUser.TryRemove(connectionId, out var userId))
            {
                if (UserConnections.TryGetValue(userId, out var connections))
                {
                    connections.Remove(connectionId);
                    if (connections.Count == 0)
                    {
                        UserConnections.TryRemove(userId, out _);
                    }
                }
                
                Console.WriteLine($"[SignalR] User '{userId}' disconnected. Remaining: {GetConnectionCount(userId)}");
            }

            await base.OnDisconnectedAsync(exception);
        }

        public static IEnumerable<string> GetUserConnections(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections) 
                ? connections.ToList() 
                : Array.Empty<string>();
        }

        public static int GetConnectionCount(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections) 
                ? connections.Count 
                : 0;
        }

        public static bool IsUserConnected(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections) && connections.Count > 0;
        }
    }
}
