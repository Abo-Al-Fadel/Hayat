using Backend.Dtos.User;

public interface IUserService
{
    Task<UserDto> CreateUserAsync(CreateUserDto dto);
    Task DeleteUserAsync(string userId);
    Task<List<UserDto>> GetAllAsync();

    /// <param name="userId">Target user's ID</param>
    /// <param name="newRole">New role to assign</param>
    /// <param name="currentUserId">ID of the admin making the change (for self-demotion check)</param>
    /// <returns>Updated UserDto</returns>
    Task<UserDto> UpdateUserRoleAsync(string userId, string newRole, string currentUserId);

    /// <summary>
    /// Updates a user's profile information (name and email).
    /// Only Admin can perform this action.
    /// </summary>
    /// <param name="userId">Target user's ID</param>
    /// <param name="dto">DTO containing new username and email</param>
    /// <returns>Updated UserDto</returns>
    Task<UserDto> UpdateUserAsync(string userId, UpdateUserDto dto);
}
