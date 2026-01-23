using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs
{
    /// <summary>
    /// SignalR Hub for real-time notifications
    /// 
    /// MULTI-SESSION SUPPORT:
    /// - Tracks multiple connections per user using a concurrent dictionary
    /// - Each browser tab gets its own connectionId
    /// - Notifications are sent to ALL connections for a user
    /// - Disconnecting one tab doesn't affect other connections
    /// 
    /// ROLE-BASED GROUPS:
    /// - Users are automatically added to groups based on their JWT role claim
    /// - Groups: "Admin", "Pharmacist", "StorageManager"
    /// - Notifications broadcast to role groups reach all users with that role
    /// </summary>
    [Authorize]
    public class NotificationsHub : Hub
    {
        // Thread-safe dictionary: userId => List of connectionIds
        // This allows multiple tabs/browsers for the same user
        private static readonly ConcurrentDictionary<string, HashSet<string>> UserConnections = new();
        
        // Reverse lookup: connectionId => userId (for efficient OnDisconnectedAsync)
        private static readonly ConcurrentDictionary<string, string> ConnectionToUser = new();

        public override async Task OnConnectedAsync()
        {
            var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                      ?? Context.User?.FindFirst("sub")?.Value
                      ?? Context.User?.Identity?.Name
                      ?? "anonymous";
            
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
                .Distinct()
                .ToList() ?? new List<string>();

            Console.WriteLine($"[SignalR] ============================================");
            Console.WriteLine($"[SignalR] User '{userId}' CONNECTED");
            Console.WriteLine($"[SignalR] ConnectionId: {connectionId}");
            Console.WriteLine($"[SignalR] Roles from JWT: [{string.Join(", ", roles)}]");

            foreach (var role in roles)
            {
                await Groups.AddToGroupAsync(connectionId, role);
                Console.WriteLine($"[SignalR] ✓ Added to group '{role}'");
            }
            
            // Also add to user-specific group for targeted messages
            await Groups.AddToGroupAsync(connectionId, $"user_{userId}");
            Console.WriteLine($"[SignalR] ✓ Added to group 'user_{userId}'");
            Console.WriteLine($"[SignalR] Total connections for user: {GetConnectionCount(userId)}");
            Console.WriteLine($"[SignalR] ============================================");

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var connectionId = Context.ConnectionId;
            
            // Remove this specific connection, not all connections for the user
            if (ConnectionToUser.TryRemove(connectionId, out var userId))
            {
                if (UserConnections.TryGetValue(userId, out var connections))
                {
                    connections.Remove(connectionId);
                    
                    // Clean up if user has no more connections
                    if (connections.Count == 0)
                    {
                        UserConnections.TryRemove(userId, out _);
                    }
                }
                
                Console.WriteLine($"[SignalR] User '{userId}' disconnected connectionId: {connectionId}. Remaining connections: {GetConnectionCount(userId)}");
            }

            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// Get all connection IDs for a specific user (for sending targeted notifications)
        /// </summary>
        public static IEnumerable<string> GetUserConnections(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections) 
                ? connections.ToList() 
                : Array.Empty<string>();
        }

        /// <summary>
        /// Get the count of active connections for a user
        /// </summary>
        public static int GetConnectionCount(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections) 
                ? connections.Count 
                : 0;
        }

        /// <summary>
        /// Check if a user has any active connections
        /// </summary>
        public static bool IsUserConnected(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections) && connections.Count > 0;
        }
    }
}
