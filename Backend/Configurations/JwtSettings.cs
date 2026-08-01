public class JwtSettings
{
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;

    /// <summary>
    /// Token lifetime in hours. Defaults to a full working shift so staff are not
    /// signed out mid-shift; the previous 2 hours expired during normal use.
    /// Clamped to 1-24 hours when read.
    /// </summary>
    public int ExpiryHours { get; set; } = 8;
}
