using System.ComponentModel.DataAnnotations;

namespace Backend.Tests.Validators;

/// <summary>
/// Data-annotation validation on the supplier DTOs.
///
/// [Phone] and [EmailAddress] pass null through but reject an empty string as
/// malformed. A form that submits blank optional fields therefore got back
/// "The Email field is not a valid e-mail address" for a field the user had
/// deliberately left empty - and the admin panel showed nothing at all, so adding
/// a supplier without an email simply appeared to do nothing.
/// </summary>
public class SupplierDtoValidationTests
{
    private static List<ValidationResult> Validate(object dto)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(dto, new ValidationContext(dto), results, validateAllProperties: true);
        return results;
    }

    // ── Create ───────────────────────────────────────────────────────────────

    [Fact]
    public void Create_AcceptsBlankOptionalFields()
    {
        var dto = new CreateSupplierDto { Name = "Blank Fields", Email = "", Phone = "" };

        Assert.Empty(Validate(dto));
        Assert.Null(dto.Email);
        Assert.Null(dto.Phone);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_TreatsBlankAndAbsentAlike(string? value)
    {
        var dto = new CreateSupplierDto { Name = "Supplier", Email = value, Phone = value };

        Assert.Empty(Validate(dto));
        Assert.Null(dto.Email);
        Assert.Null(dto.Phone);
    }

    [Fact]
    public void Create_StillRejectsAMalformedEmail()
    {
        var results = Validate(new CreateSupplierDto { Name = "Supplier", Email = "not-an-email" });
        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateSupplierDto.Email)));
    }

    [Fact]
    public void Create_RequiresAName()
    {
        var results = Validate(new CreateSupplierDto { Name = "" });
        Assert.Contains(results, r => r.MemberNames.Contains(nameof(CreateSupplierDto.Name)));
    }

    [Fact]
    public void Create_TrimsSurroundingWhitespace()
    {
        var dto = new CreateSupplierDto
        {
            Name = "Supplier",
            Email = "  contact@supplier.test  ",
            Phone = "  555-123-4567  "
        };

        Assert.Empty(Validate(dto));
        Assert.Equal("contact@supplier.test", dto.Email);
        Assert.Equal("555-123-4567", dto.Phone);
    }

    // ── Update ───────────────────────────────────────────────────────────────

    [Fact]
    public void Update_AcceptsBlankOptionalFields()
    {
        // Clearing a supplier's email in the edit form submits "".
        var dto = new UpdateSupplierDto { Name = "Blank Fields", Email = "", Phone = "" };

        Assert.Empty(Validate(dto));
        Assert.Null(dto.Email);
        Assert.Null(dto.Phone);
    }

    [Fact]
    public void Update_RejectsAMalformedEmail_AsCreateDoes()
    {
        // The update DTO carried no validation attributes at all, so it accepted
        // values the create endpoint refused.
        var results = Validate(new UpdateSupplierDto { Name = "Supplier", Email = "still-not-an-email" });
        Assert.Contains(results, r => r.MemberNames.Contains(nameof(UpdateSupplierDto.Email)));
    }

    [Fact]
    public void Update_RequiresAName()
    {
        var results = Validate(new UpdateSupplierDto { Name = "" });
        Assert.Contains(results, r => r.MemberNames.Contains(nameof(UpdateSupplierDto.Name)));
    }
}
