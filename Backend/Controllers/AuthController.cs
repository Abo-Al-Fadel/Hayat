using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        // Single message for every failure mode so the response cannot be used to
        // discover which usernames exist.
        private const string InvalidCredentialsMessage = "Invalid username or password.";

        private readonly UserManager<AppUser> _userManager;
        private readonly SignInManager<AppUser> _signInManager;
        private readonly ITokenService _tokenService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            UserManager<AppUser> userManager,
            SignInManager<AppUser> signInManager,
            ITokenService tokenService,
            ILogger<AuthController> logger)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _tokenService = tokenService;
            _logger = logger;
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginDto loginDto)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var user = await _userManager.FindByNameAsync(loginDto.UserName);
            if (user == null)
            {
                _logger.LogWarning("[Auth] Failed login for unknown user '{UserName}'", loginDto.UserName);
                return Unauthorized(InvalidCredentialsMessage);
            }

            // Goes through SignInManager rather than CheckPasswordAsync so that failed
            // attempts count towards Identity's lockout and brute force is throttled.
            var signInResult = await _signInManager.CheckPasswordSignInAsync(user, loginDto.Password, lockoutOnFailure: true);

            if (signInResult.IsLockedOut)
            {
                _logger.LogWarning("[Auth] Login blocked - account '{UserName}' is locked out", user.UserName);
                return Unauthorized(InvalidCredentialsMessage);
            }

            if (!signInResult.Succeeded)
            {
                _logger.LogWarning("[Auth] Failed login for '{UserName}'", user.UserName);
                return Unauthorized(InvalidCredentialsMessage);
            }

            var roles = await _userManager.GetRolesAsync(user);
            var token = _tokenService.CreateToken(user, roles);

            _logger.LogInformation("[Auth] Login success for '{UserName}' with role '{Role}'", user.UserName, roles.FirstOrDefault());

            return Ok(new LoginResponseDto
            {
                Token = token,
                User = new LoginUserDto
                {
                    Id = user.Id,
                    Username = user.UserName ?? "",
                    Email = user.Email ?? "",
                    Role = roles.FirstOrDefault() ?? ""
                }
            });
        }

    }
}
