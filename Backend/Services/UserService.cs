using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Backend.Dtos.User;

public class UserService : IUserService
{
    private readonly UserManager<AppUser> _userManager;
    private readonly RoleManager<IdentityRole> _roleManager;

    public UserService(
        UserManager<AppUser> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        _userManager = userManager;
        _roleManager = roleManager;
    }

    public async Task<UserDto> CreateUserAsync(CreateUserDto dto)
    {
        var roleName = dto.Role.ToString();

        if (!await _roleManager.RoleExistsAsync(roleName))
            throw new Exception($"Role {roleName} does not exist.");

        if (await _userManager.FindByEmailAsync(dto.Email) != null)
            throw new Exception("Email already exists.");

        var user = new AppUser
        {
            UserName = dto.UserName,
            Email = dto.Email,
            EmailConfirmed = true
        };

        var result = await _userManager.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
            throw new Exception(result.Errors.First().Description);

        await _userManager.AddToRoleAsync(user, roleName);

        return new UserDto
        {
            Id = user.Id,
            UserName = user.UserName!,
            Email = user.Email!,
            Role = roleName
        };
    }

    public async Task DeleteUserAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
            throw new Exception("User not found.");

        // SECURITY: Prevent deleting the last Admin
        var userRoles = await _userManager.GetRolesAsync(user);
        if (userRoles.Contains("Admin"))
        {
            var admins = await _userManager.GetUsersInRoleAsync("Admin");
            if (admins.Count <= 1)
            {
                throw new InvalidOperationException("Cannot delete the last Admin. The system must have at least one Admin.");
            }
        }

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
            throw new Exception("Failed to delete user.");
    }

    public async Task<List<UserDto>> GetAllAsync()
    {
        // Use AsNoTracking for read-only query (better performance)
        var users = await _userManager.Users.AsNoTracking().ToListAsync();
        var result = new List<UserDto>(users.Count); // Pre-allocate capacity

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);

            result.Add(new UserDto
            {
                Id = user.Id,
                UserName = user.UserName!,
                Email = user.Email!,
                Role = roles.FirstOrDefault() ?? "None"
            });
        }

        return result;
    }

    public async Task<UserDto> UpdateUserRoleAsync(string userId, string newRole, string currentUserId)
    {
        // Validate role value - must be one of the allowed roles
        var validRoles = new[] { "Admin", "Pharmacist", "StorageManager" };
        if (!validRoles.Contains(newRole, StringComparer.OrdinalIgnoreCase))
        {
            throw new ArgumentException($"Invalid role. Must be one of: {string.Join(", ", validRoles)}");
        }

        // Find the target user
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            throw new Exception("User not found.");
        }

        // Get current roles
        var currentRoles = await _userManager.GetRolesAsync(user);
        var currentRole = currentRoles.FirstOrDefault() ?? "None";

        // Self-demotion check: Admin cannot remove their own Admin role
        if (userId == currentUserId && 
            currentRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) && 
            !newRole.Equals("Admin", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("You cannot remove your own Admin role.");
        }

        // SECURITY: Prevent demoting the last Admin
        if (currentRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) && 
            !newRole.Equals("Admin", StringComparison.OrdinalIgnoreCase))
        {
            var admins = await _userManager.GetUsersInRoleAsync("Admin");
            if (admins.Count <= 1)
            {
                throw new InvalidOperationException("Cannot demote the last Admin. The system must have at least one Admin.");
            }
        }

        // Check if the new role exists in the system
        if (!await _roleManager.RoleExistsAsync(newRole))
        {
            throw new Exception($"Role '{newRole}' does not exist in the system.");
        }

        // Remove all current roles
        if (currentRoles.Any())
        {
            var removeResult = await _userManager.RemoveFromRolesAsync(user, currentRoles);
            if (!removeResult.Succeeded)
            {
                throw new Exception("Failed to remove current roles: " + 
                    string.Join(", ", removeResult.Errors.Select(e => e.Description)));
            }
        }

        // Add the new role
        var addResult = await _userManager.AddToRoleAsync(user, newRole);
        if (!addResult.Succeeded)
        {
            throw new Exception("Failed to assign new role: " + 
                string.Join(", ", addResult.Errors.Select(e => e.Description)));
        }

        // Return updated user DTO
        return new UserDto
        {
            Id = user.Id,
            UserName = user.UserName!,
            Email = user.Email!,
            Role = newRole
        };
    }

    public async Task<UserDto> UpdateUserAsync(string userId, UpdateUserDto dto)
    {
        // Find the target user
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            throw new KeyNotFoundException("User not found.");
        }

        // Check if email is already taken by another user
        var existingUserByEmail = await _userManager.FindByEmailAsync(dto.Email);
        if (existingUserByEmail != null && existingUserByEmail.Id != userId)
        {
            throw new InvalidOperationException("Email is already in use by another user.");
        }

        // Check if username is already taken by another user
        var existingUserByName = await _userManager.FindByNameAsync(dto.UserName);
        if (existingUserByName != null && existingUserByName.Id != userId)
        {
            throw new InvalidOperationException("Username is already in use by another user.");
        }

        // Update user properties
        user.UserName = dto.UserName;
        user.Email = dto.Email;
        user.NormalizedUserName = dto.UserName.ToUpperInvariant();
        user.NormalizedEmail = dto.Email.ToUpperInvariant();

        // Save changes
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new Exception("Failed to update user: " + 
                string.Join(", ", result.Errors.Select(e => e.Description)));
        }

        // Get user's role for the response
        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? "None";

        // Return updated user DTO
        return new UserDto
        {
            Id = user.Id,
            UserName = user.UserName!,
            Email = user.Email!,
            Role = role
        };
    }

}
