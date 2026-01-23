/// <summary>
/// Login response DTO - Returns token and user info
/// NO cookies, NO server sessions - stateless JWT auth only
/// </summary>
public class LoginResponseDto
{
    public string Token { get; set; } = string.Empty;
    public LoginUserDto User { get; set; } = new();
}

public class LoginUserDto
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}
