using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
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

        /// <summary>
        /// Get notifications for the authenticated user's role.
        /// 
        /// SERVER-SIDE ROLE ENFORCEMENT:
        /// - If no role is specified, defaults to the user's JWT role claim
        /// - Users can ONLY request notifications for their OWN role
        /// - This prevents Pharmacist from seeing Admin/StorageManager notifications
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] string? role,
            [FromQuery] bool unreadOnly = true,
            [FromQuery] int take = 50)
        {
            // Get the authenticated user's role from JWT claims
            var userRole = User.Claims
                .FirstOrDefault(c => c.Type == ClaimTypes.Role || c.Type == "role")?.Value;
            
            _logger.LogInformation("[Notifications] GET request - User role: {UserRole}, Requested role: {RequestedRole}", 
                userRole, role ?? "(none)");
            
            // SERVER-SIDE ENFORCEMENT: If no role specified, use user's own role
            // If role is specified, verify it matches user's role (prevent cross-role access)
            string effectiveRole;
            
            if (string.IsNullOrWhiteSpace(role))
            {
                // Default to user's own role
                effectiveRole = userRole ?? "Unknown";
                _logger.LogInformation("[Notifications] No role specified, defaulting to user's role: {Role}", effectiveRole);
            }
            else if (userRole?.Equals(role, StringComparison.OrdinalIgnoreCase) == true)
            {
                // Role matches user's role - allow
                effectiveRole = role;
            }
            else
            {
                // SECURITY: User is trying to access another role's notifications
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
        public async Task<IActionResult> MarkRead([FromBody] int[] ids)
        {
            return await _service.MarkReadAsync(ids)
                ? NoContent()
                : NotFound();
        }

        [HttpPost("markallread")]
        public async Task<IActionResult> MarkAllRead([FromQuery] string role)
        {
            return await _service.MarkAllReadAsync(role)
                ? NoContent()
                : NotFound();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            return await _service.DeleteAsync(id)
                ? NoContent()
                : NotFound();
        }
    }
}
