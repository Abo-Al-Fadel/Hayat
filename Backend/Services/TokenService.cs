using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Backend.Services
{
    public class TokenService : ITokenService
    {
        private readonly IConfiguration _config;

        public TokenService(IConfiguration config)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
        }

        public string CreateToken(AppUser user, IList<string> roles)
        {
            if (user == null) throw new ArgumentNullException(nameof(user));
            roles = roles ?? new List<string>();

            var claims = new List<Claim>
            {
                // Standard claims - sub MUST be userId for proper identification
                new Claim(JwtRegisteredClaimNames.Sub, user.Id ?? string.Empty),
                new Claim(ClaimTypes.NameIdentifier, user.Id ?? string.Empty),
                new Claim(ClaimTypes.Name, user.UserName ?? string.Empty),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            };

            // Add role claims - use ONLY ClaimTypes.Role (standard)
            // The "role" claim is handled by ASP.NET Core middleware automatically
            foreach (var role in roles)
            {
                if (string.IsNullOrWhiteSpace(role)) continue;
                claims.Add(new Claim(ClaimTypes.Role, role));
            }

            var keyString = _config["JwtSettings:Key"];
            if (string.IsNullOrEmpty(keyString))
                throw new InvalidOperationException("JWT:Key is not configured.");

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyString));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            // Configurable lifetime; clamped so a typo cannot mint a multi-year token.
            var expiryHours = int.TryParse(_config["JwtSettings:ExpiryHours"], out var configured)
                ? Math.Clamp(configured, 1, 24)
                : 8;

            var token = new JwtSecurityToken(
                issuer: _config["JwtSettings:Issuer"],
                audience: _config["JwtSettings:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddHours(expiryHours),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
