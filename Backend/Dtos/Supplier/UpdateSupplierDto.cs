using System.ComponentModel.DataAnnotations;

public class UpdateSupplierDto
{
    [Required]
    public string Name { get; set; } = string.Empty;

    // Same normalisation as CreateSupplierDto: clearing a supplier's phone or email in
    // the edit form submits "", which the validation attributes read as malformed
    // rather than empty. Blank means absent.
    //
    // These attributes were previously absent here entirely, so the update endpoint
    // accepted a malformed email that the create endpoint would have rejected.
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
