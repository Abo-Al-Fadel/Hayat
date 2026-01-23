using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationManagerService _service;

        public NotificationsController(INotificationManagerService service)
        {
            _service = service;
        }

        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] string? role,
            [FromQuery] bool unreadOnly = true,
            [FromQuery] int take = 50)
        {
            return Ok(await _service.GetAsync(role, unreadOnly, take));
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
