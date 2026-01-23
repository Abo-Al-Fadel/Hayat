namespace Backend.Services
{
    public interface ITokenService
    {
        string CreateToken(AppUser user, IList<string> roles);
    }
}
