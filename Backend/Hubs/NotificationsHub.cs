using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs
{
    [Authorize]
    public class NotificationsHub : Hub
    {
        // userId => set of connectionIds (one per tab/browser).
        //
        // The inner collection must itself be concurrent. ConcurrentDictionary does not
        // hold a lock while running the AddOrUpdate delegate, so a plain HashSet here was
        // mutated without synchronisation - concurrent connects/disconnects for the same
        // user could corrupt it or make GetUserConnections throw mid-enumeration.
        // The inner byte value is unused; ConcurrentDictionary is just the available set.
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> UserConnections = new();

        // Reverse lookup: connectionId => userId (for efficient OnDisconnectedAsync)
        private static readonly ConcurrentDictionary<string, string> ConnectionToUser = new();

        // Valid roles for SignalR groups
        private static readonly HashSet<string> ValidRoles = new(StringComparer.OrdinalIgnoreCase)
        {
            "Admin", "Pharmacist", "StorageManager"
        };

        private readonly ILogger<NotificationsHub> _logger;

        public NotificationsHub(ILogger<NotificationsHub> logger)
        {
            _logger = logger;
        }

        public override async Task OnConnectedAsync()
        {
            var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                      ?? Context.User?.FindFirst("sub")?.Value
                      ?? Context.User?.Identity?.Name;

            // SECURITY: Reject connection if no valid user identity
            if (string.IsNullOrEmpty(userId))
            {
                _logger.LogWarning("[SignalR] Rejected connection: no user identity in token");
                Context.Abort();
                return;
            }

            var connectionId = Context.ConnectionId;

            // Track this connection for the user
            UserConnections
                .GetOrAdd(userId, _ => new ConcurrentDictionary<string, byte>())
                .TryAdd(connectionId, 0);
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
                _logger.LogWarning("[SignalR] Rejected connection: user {UserId} has no valid roles", userId);
                Context.Abort();
                return;
            }

            _logger.LogInformation("[SignalR] User {UserId} connected with roles {Roles}", userId, string.Join(", ", roles));

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
                    connections.TryRemove(connectionId, out _);
                    if (connections.IsEmpty)
                    {
                        // Only drop the user entry if it is still empty, so a reconnect
                        // racing this disconnect is not silently discarded.
                        UserConnections.TryRemove(
                            new KeyValuePair<string, ConcurrentDictionary<string, byte>>(userId, connections));
                    }
                }

                _logger.LogInformation("[SignalR] User {UserId} disconnected, {Remaining} connection(s) remaining", userId, GetConnectionCount(userId));
            }

            await base.OnDisconnectedAsync(exception);
        }

        public static IEnumerable<string> GetUserConnections(string userId)
        {
            return UserConnections.TryGetValue(userId, out var connections)
                ? connections.Keys.ToList()
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
