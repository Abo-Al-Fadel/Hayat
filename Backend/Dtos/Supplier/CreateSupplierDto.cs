using System.ComponentModel.DataAnnotations;

public class CreateSupplierDto
{
    [Required]
    public string Name { get; set; } = null!;

    // Phone and Email are optional, but [Phone] and [EmailAddress] treat an empty
    // string as malformed - only null passes. A form submitting a blank optional field
    // therefore got a 400 saying the value was invalid, when the intent was to leave it
    // out. Normalising on set runs during model binding, before validation, so blank
    // and absent mean the same thing.
    private string? _phone;
    private string? _email;

    [Phone]
    public string? Phone
    {
        get => _phone;
        set => _phone = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    [EmailAddress]
    public string? Email
    {
        get => _email;
        set => _email = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
