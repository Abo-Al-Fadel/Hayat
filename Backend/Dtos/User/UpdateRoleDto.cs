namespace Backend.Dtos.User;

/// <summary>
/// DTO for updating a user's role via PATCH /api/Users/{userId}/role
/// </summary>
public class UpdateRoleDto
{
    /// <summary>
    /// The new role to assign. Must be one of: "Admin", "Pharmacist", "StorageManager"
    /// </summary>
    public string Role { get; set; } = string.Empty;
}
