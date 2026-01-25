using System.ComponentModel.DataAnnotations;
namespace Backend.Dtos.User;
public class CreateUserDto
{
    [Required(ErrorMessage = "UserName is required")]
    public string UserName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required")]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Role is required")]
    public AppRole Role { get; set; }
}