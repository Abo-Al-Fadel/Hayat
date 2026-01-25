using Backend.Validators.Supplier;
using FluentValidation.TestHelper;
using Xunit;

namespace Backend.Tests.Validators;

/// <summary>
/// Unit tests for UpdateSupplierDtoValidator
/// Tests validation rules for name, email, and phone
/// </summary>
public class UpdateSupplierDtoValidatorTests
{
    private readonly UpdateSupplierDtoValidator _validator;

    public UpdateSupplierDtoValidatorTests()
    {
        _validator = new UpdateSupplierDtoValidator();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Name Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Name_WhenEmpty_ShouldHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Name)
            .WithErrorMessage("Supplier name is required");
    }

    [Fact]
    public void Name_WhenWhitespace_ShouldHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "   " };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Name);
    }

    [Fact]
    public void Name_WhenTooLong_ShouldHaveError()
    {
        var dto = new UpdateSupplierDto { Name = new string('A', 101) };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Name)
            .WithErrorMessage("Name cannot exceed 100 characters");
    }

    [Fact]
    public void Name_WhenValid_ShouldNotHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Valid Supplier Name" };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Name);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Email Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Email_WhenEmpty_ShouldNotHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Test", Email = "" };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Email);
    }

    [Fact]
    public void Email_WhenNull_ShouldNotHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Test", Email = null };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Email);
    }

    [Theory]
    [InlineData("invalid")]
    [InlineData("invalid@")]
    [InlineData("@invalid.com")]
    [InlineData("invalid.com")]
    public void Email_WhenInvalidFormat_ShouldHaveError(string email)
    {
        var dto = new UpdateSupplierDto { Name = "Test", Email = email };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorMessage("Invalid email format");
    }

    [Theory]
    [InlineData("valid@email.com")]
    [InlineData("user.name@domain.org")]
    [InlineData("user+tag@company.co.uk")]
    public void Email_WhenValidFormat_ShouldNotHaveError(string email)
    {
        var dto = new UpdateSupplierDto { Name = "Test", Email = email };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Email);
    }

    [Fact]
    public void Email_WhenTooLong_ShouldHaveError()
    {
        var longEmail = new string('a', 92) + "@test.com"; // 101 chars
        var dto = new UpdateSupplierDto { Name = "Test", Email = longEmail };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorMessage("Email cannot exceed 100 characters");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Phone Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Phone_WhenEmpty_ShouldNotHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Test", Phone = "" };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Phone);
    }

    [Fact]
    public void Phone_WhenNull_ShouldNotHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Test", Phone = null };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Phone);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("123-abc-4567")]
    [InlineData("phone@number")]
    public void Phone_WhenInvalidFormat_ShouldHaveError(string phone)
    {
        var dto = new UpdateSupplierDto { Name = "Test", Phone = phone };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorMessage("Invalid phone number format");
    }

    [Fact]
    public void Phone_WhenTooShort_ShouldHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Test", Phone = "123456" }; // 6 digits
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorMessage("Phone number is too short");
    }

    [Fact]
    public void Phone_WhenTooLong_ShouldHaveError()
    {
        var dto = new UpdateSupplierDto { Name = "Test", Phone = new string('1', 21) };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Phone)
            .WithErrorMessage("Phone number is too long");
    }

    [Theory]
    [InlineData("1234567")]
    [InlineData("123-456-7890")]
    [InlineData("+1 (555) 123-4567")]
    [InlineData("(555) 123-4567")]
    [InlineData("+44 20 7946 0958")]
    public void Phone_WhenValidFormat_ShouldNotHaveError(string phone)
    {
        var dto = new UpdateSupplierDto { Name = "Test", Phone = phone };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Phone);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Combined Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void AllFields_WhenValid_ShouldPass()
    {
        var dto = new UpdateSupplierDto 
        { 
            Name = "PharmaCorp",
            Email = "contact@pharmacorp.com",
            Phone = "+1 (800) 555-1234"
        };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void AllFields_WhenMultipleErrors_ShouldReportAll()
    {
        var dto = new UpdateSupplierDto 
        { 
            Name = "",
            Email = "invalid",
            Phone = "abc"
        };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Name);
        result.ShouldHaveValidationErrorFor(x => x.Email);
        result.ShouldHaveValidationErrorFor(x => x.Phone);
    }
}
