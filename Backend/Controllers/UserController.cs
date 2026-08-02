using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Dtos.User;
using System.Security.Claims;

[ApiController]
[Route("api/[controller]")]
// Authentication only - see the note in SupplierController about cumulative
// [Authorize] attributes. Reading the staff list is separate from changing it.
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IUserService _service;
    private readonly ILogger<UsersController> _logger;

    public UsersController(IUserService service, ILogger<UsersController> logger)
    {
        _service = service;
        _logger = logger;
    }

    [HttpPost("create")]
    [Authorize(Roles = Roles.CanManageUsers)]
    public async Task<IActionResult> Create(CreateUserDto dto)
    {
        try
        {
            var user = await _service.CreateUserAsync(dto);
            _logger.LogInformation("[Security] User created: {UserName}, Role: {Role}", dto.UserName, dto.Role);
            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Security] User creation failed for {UserName}", dto.UserName);
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{userId}")]
    [Authorize(Roles = Roles.CanManageUsers)]
    public async Task<IActionResult> Delete(string userId)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("nameid")
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(currentUserId))
        {
            _logger.LogWarning("[Security] Delete user failed: Could not identify current user");
            return Unauthorized("Could not identify the current user.");
        }

        if (userId == currentUserId)
        {
            _logger.LogWarning("[Security] Admin {UserId} attempted self-deletion - BLOCKED", currentUserId);
            return BadRequest("You cannot delete your own account. Ask another admin to remove you.");
        }

        try
        {
            await _service.DeleteUserAsync(userId);
            _logger.LogInformation("[Security] User deleted: {UserId} by Admin {AdminId}", userId, currentUserId);
            return Ok("User deleted successfully");
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("[Security] Delete user blocked: {Message}", ex.Message);
            return BadRequest(ex.Message);
        }
    }

    [HttpGet]
    [Authorize(Roles = Roles.CanReadUsers)]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _service.GetAllAsync());
    }

    // Updates a user's role.
    [HttpPatch("{userId}/role")]
    [Authorize(Roles = Roles.CanManageUsers)]
    public async Task<IActionResult> UpdateRole(string userId, [FromBody] UpdateRoleDto dto)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("nameid")
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(currentUserId))
        {
            _logger.LogWarning("[Security] Role update failed: Could not identify current user");
            return Unauthorized("Could not identify the current user.");
        }

        try
        {
            var updatedUser = await _service.UpdateUserRoleAsync(userId, dto.Role, currentUserId);
            _logger.LogInformation("[Security] Role updated: User {UserId} changed to {Role} by Admin {AdminId}",
                userId, dto.Role, currentUserId);
            return Ok(updatedUser);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning("[Security] Invalid role update attempt: {Message}", ex.Message);
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("[Security] Role update blocked: {Message}", ex.Message);
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }

    // Updates a user's profile information (username and email).
    [HttpPut("{userId}")]
    [Authorize(Roles = Roles.CanManageUsers)]
    public async Task<IActionResult> Update(string userId, [FromBody] UpdateUserDto dto)
    {
        try
        {
            var updatedUser = await _service.UpdateUserAsync(userId, dto);
            _logger.LogInformation("[Security] User profile updated: {UserId}, NewUserName: {UserName}",
                userId, dto.UserName);
            return Ok(updatedUser);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("[Security] User update blocked: {Message}", ex.Message);
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Security] User update failed: {Message}", ex.Message);
            return BadRequest(ex.Message);
        }
    }
}
