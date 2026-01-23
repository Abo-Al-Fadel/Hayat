public interface IUserService
{
    Task<UserDto> CreateUserAsync(CreateUserDto dto);
    Task DeleteUserAsync(string userId);
    Task<List<UserDto>> GetAllAsync();
    
    /// <summary>
    /// Updates a user's role. Only Admin can perform this action.
    /// Validates that role is one of: Admin, Pharmacist, StorageManager
    /// </summary>
    /// <param name="userId">Target user's ID</param>
    /// <param name="newRole">New role to assign</param>
    /// <param name="currentUserId">ID of the admin making the change (for self-demotion check)</param>
    /// <returns>Updated UserDto</returns>
    Task<UserDto> UpdateUserRoleAsync(string userId, string newRole, string currentUserId);
}
