using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Backend.Dtos.User;
using System.Security.Claims;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly IUserService _service;

    public UsersController(IUserService service)
    {
        _service = service;
    }

    [HttpPost("create")]
    public async Task<IActionResult> Create(CreateUserDto dto)
    {
        var user = await _service.CreateUserAsync(dto);
        return Ok(user);
    }

    [HttpDelete("{userId}")]
    public async Task<IActionResult> Delete(string userId)
    {
        // SAFETY: Extract current user ID from JWT claims to prevent self-deletion
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("nameid") 
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(currentUserId))
        {
            return Unauthorized("Could not identify the current user.");
        }

        // BLOCK: Admins cannot delete themselves to prevent zero-admin state
        if (userId == currentUserId)
        {
            return BadRequest("You cannot delete your own account. Ask another admin to remove you.");
        }

        await _service.DeleteUserAsync(userId);
        return Ok("User deleted successfully");
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _service.GetAllAsync());
    }

    /// <summary>
    /// PATCH /api/Users/{userId}/role
    /// Updates a user's role. Only Admin can perform this action.
    /// 
    /// Request Body: { "role": "Admin" | "Pharmacist" | "StorageManager" }
    /// Response: Updated UserDto { id, userName, email, role }
    /// 
    /// Safety Rules:
    /// - Only Admin role can access this endpoint
    /// - Admin cannot demote themselves (self-demotion protection)
    /// - Role must be one of: Admin, Pharmacist, StorageManager
    /// </summary>
    [HttpPatch("{userId}/role")]
    public async Task<IActionResult> UpdateRole(string userId, [FromBody] UpdateRoleDto dto)
    {
        // Get the current user's ID from the JWT token claims
        // This is used for self-demotion validation in the service
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("nameid") 
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(currentUserId))
        {
            return Unauthorized("Could not identify the current user.");
        }

        try
        {
            var updatedUser = await _service.UpdateUserRoleAsync(userId, dto.Role, currentUserId);
            return Ok(updatedUser);
        }
        catch (ArgumentException ex)
        {
            // Invalid role value
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            // Self-demotion attempt
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            // User not found or other errors
            return NotFound(ex.Message);
        }
    }
}
