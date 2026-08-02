using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    // Reading is open to any signed-in user, including the read-only HR observer.
    // The three mutating actions below are not: "views everything, changes nothing"
    // has to hold even for a user's own notification state, or the rule has exceptions
    // nobody remembers.
    [Authorize]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationManagerService _service;
        private readonly ILogger<NotificationsController> _logger;

        public NotificationsController(INotificationManagerService service, ILogger<NotificationsController> logger)
        {
            _service = service;
            _logger = logger;
        }

        /// <summary>The caller's own role, taken from the JWT. Never from the request body/query.</summary>
        private string? CallerRole => User.Claims
            .FirstOrDefault(c => c.Type == ClaimTypes.Role || c.Type == "role")?.Value;

        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] string? role,
            [FromQuery] bool unreadOnly = true,
            [FromQuery] int take = 50)
        {
            var userRole = CallerRole;

            _logger.LogInformation("[Notifications] GET request - User role: {UserRole}, Requested role: {RequestedRole}",
                userRole, role ?? "(none)");

            string effectiveRole;

            if (string.IsNullOrWhiteSpace(role))
            {
                // Default to user's own role
                effectiveRole = userRole ?? "Unknown";
                _logger.LogInformation("[Notifications] No role specified, defaulting to user's role: {Role}", effectiveRole);
            }
            else if (userRole?.Equals(role, StringComparison.OrdinalIgnoreCase) == true)
            {
                effectiveRole = role;
            }
            else
            {
                _logger.LogWarning("[Notifications] BLOCKED: User with role '{UserRole}' attempted to access '{RequestedRole}' notifications",
                    userRole, role);
                effectiveRole = userRole ?? "Unknown";
            }

            var notifications = await _service.GetAsync(effectiveRole, unreadOnly, take);
            _logger.LogInformation("[Notifications] Returning {Count} notifications for role: {Role}",
                notifications.Count(), effectiveRole);

            return Ok(notifications);
        }

        [HttpPost("markread")]
        [Authorize(Roles = Roles.CanManageOwnNotifications)]
        public async Task<IActionResult> MarkRead([FromBody] int[] ids)
        {
            var callerRole = CallerRole;
            if (string.IsNullOrWhiteSpace(callerRole)) return Forbid();

            return await _service.MarkReadAsync(ids, callerRole)
                ? NoContent()
                : NotFound();
        }

        [HttpPost("markallread")]
        [Authorize(Roles = Roles.CanManageOwnNotifications)]
        public async Task<IActionResult> MarkAllRead()
        {
            // The role is taken from the token, never from the query string - otherwise
            // any authenticated user could clear another role's notifications.
            var callerRole = CallerRole;
            if (string.IsNullOrWhiteSpace(callerRole)) return Forbid();

            return await _service.MarkAllReadAsync(callerRole)
                ? NoContent()
                : NotFound();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = Roles.CanManageOwnNotifications)]
        public async Task<IActionResult> Delete(int id)
        {
            var callerRole = CallerRole;
            if (string.IsNullOrWhiteSpace(callerRole)) return Forbid();

            return await _service.DeleteAsync(id, callerRole)
                ? NoContent()
                : NotFound();
        }
    }
}
