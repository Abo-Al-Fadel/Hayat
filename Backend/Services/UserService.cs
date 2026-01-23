using Hayaa.Backend.Dtos.Medicine;
using Microsoft.AspNetCore.Identity;

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

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
            throw new Exception("Failed to delete user.");
    }

    public async Task<List<UserDto>> GetAllAsync()
    {
        var users = _userManager.Users.ToList();
        var result = new List<UserDto>();

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

    /// <summary>
    /// Updates a user's role with validation.
    /// - Validates role is one of: Admin, Pharmacist, StorageManager
    /// - Prevents admin from demoting themselves
    /// - Removes old role and assigns new role
    /// </summary>
    public async Task<UserDto> UpdateUserRoleAsync(string userId, string newRole, string currentUserId)
    {
        // 1️⃣ Validate role value - must be one of the allowed roles
        var validRoles = new[] { "Admin", "Pharmacist", "StorageManager" };
        if (!validRoles.Contains(newRole, StringComparer.OrdinalIgnoreCase))
        {
            throw new ArgumentException($"Invalid role. Must be one of: {string.Join(", ", validRoles)}");
        }

        // 2️⃣ Find the target user
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            throw new Exception("User not found.");
        }

        // 3️⃣ Get current roles
        var currentRoles = await _userManager.GetRolesAsync(user);
        var currentRole = currentRoles.FirstOrDefault() ?? "None";

        // 4️⃣ Self-demotion check: Admin cannot remove their own Admin role
        if (userId == currentUserId && 
            currentRole.Equals("Admin", StringComparison.OrdinalIgnoreCase) && 
            !newRole.Equals("Admin", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("You cannot remove your own Admin role.");
        }

        // 5️⃣ Check if the new role exists in the system
        if (!await _roleManager.RoleExistsAsync(newRole))
        {
            throw new Exception($"Role '{newRole}' does not exist in the system.");
        }

        // 6️⃣ Remove all current roles
        if (currentRoles.Any())
        {
            var removeResult = await _userManager.RemoveFromRolesAsync(user, currentRoles);
            if (!removeResult.Succeeded)
            {
                throw new Exception("Failed to remove current roles: " + 
                    string.Join(", ", removeResult.Errors.Select(e => e.Description)));
            }
        }

        // 7️⃣ Add the new role
        var addResult = await _userManager.AddToRoleAsync(user, newRole);
        if (!addResult.Succeeded)
        {
            throw new Exception("Failed to assign new role: " + 
                string.Join(", ", addResult.Errors.Select(e => e.Description)));
        }

        // 8️⃣ Return updated user DTO
        return new UserDto
        {
            Id = user.Id,
            UserName = user.UserName!,
            Email = user.Email!,
            Role = newRole
        };
    }

}
