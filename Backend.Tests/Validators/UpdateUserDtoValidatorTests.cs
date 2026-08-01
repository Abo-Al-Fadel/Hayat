using FluentValidation.TestHelper;
using Backend.Validators.User;
using Backend.Dtos.User;
using Xunit;

namespace Backend.Tests.Validators;

/// <summary>
/// Unit tests for UpdateUserDtoValidator
/// Tests validation rules for username and email
/// </summary>
public class UpdateUserDtoValidatorTests
{
    private readonly UpdateUserDtoValidator _validator;

    public UpdateUserDtoValidatorTests()
    {
        _validator = new UpdateUserDtoValidator();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Username Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void UserName_WhenEmpty_ShouldHaveError()
    {
        var dto = new UpdateUserDto { UserName = "", Email = "test@test.com" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.UserName)
            .WithErrorMessage("Username is required");
    }

    [Fact]
    public void UserName_WhenWhitespace_ShouldHaveError()
    {
        var dto = new UpdateUserDto { UserName = "   ", Email = "test@test.com" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.UserName);
    }

    [Fact]
    public void UserName_WhenTooShort_ShouldHaveError()
    {
        var dto = new UpdateUserDto { UserName = "a", Email = "test@test.com" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.UserName)
            .WithErrorMessage("Username must be at least 2 characters");
    }

    [Fact]
    public void UserName_WhenTooLong_ShouldHaveError()
    {
        var dto = new UpdateUserDto { UserName = new string('a', 51), Email = "test@test.com" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.UserName)
            .WithErrorMessage("Username cannot exceed 50 characters");
    }

    [Theory]
    [InlineData("user name")]  // space
    [InlineData("user@name")]  // @
    [InlineData("user#name")]  // #
    [InlineData("user!name")]  // !
    public void UserName_WhenContainsInvalidCharacters_ShouldHaveError(string userName)
    {
        var dto = new UpdateUserDto { UserName = userName, Email = "test@test.com" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.UserName)
            .WithErrorMessage("Username can only contain letters, numbers, underscores, hyphens, and dots");
    }

    [Theory]
    [InlineData("validuser")]
    [InlineData("user123")]
    [InlineData("user_name")]
    [InlineData("user-name")]
    [InlineData("user.name")]
    [InlineData("User_Name-123.test")]
    public void UserName_WhenValid_ShouldNotHaveError(string userName)
    {
        var dto = new UpdateUserDto { UserName = userName, Email = "test@test.com" };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.UserName);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Email Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Email_WhenEmpty_ShouldHaveError()
    {
        var dto = new UpdateUserDto { UserName = "testuser", Email = "" };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorMessage("Email is required");
    }

    [Theory]
    [InlineData("invalid")]
    [InlineData("invalid@")]
    [InlineData("@invalid.com")]
    [InlineData("invalid.com")]
    public void Email_WhenInvalidFormat_ShouldHaveError(string email)
    {
        var dto = new UpdateUserDto { UserName = "testuser", Email = email };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorMessage("Invalid email format");
    }

    [Fact]
    public void Email_WhenTooLong_ShouldHaveError()
    {
        var longEmail = new string('a', 92) + "@test.com"; // 101 chars
        var dto = new UpdateUserDto { UserName = "testuser", Email = longEmail };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.Email)
            .WithErrorMessage("Email cannot exceed 100 characters");
    }

    [Theory]
    [InlineData("valid@email.com")]
    [InlineData("user.name@domain.org")]
    [InlineData("user+tag@company.co.uk")]
    public void Email_WhenValidFormat_ShouldNotHaveError(string email)
    {
        var dto = new UpdateUserDto { UserName = "testuser", Email = email };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveValidationErrorFor(x => x.Email);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Combined Validation Tests
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public void AllFields_WhenValid_ShouldPass()
    {
        var dto = new UpdateUserDto
        {
            UserName = "validuser",
            Email = "valid@email.com"
        };
        var result = _validator.TestValidate(dto);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void AllFields_WhenMultipleErrors_ShouldReportAll()
    {
        var dto = new UpdateUserDto
        {
            UserName = "",
            Email = "invalid"
        };
        var result = _validator.TestValidate(dto);
        result.ShouldHaveValidationErrorFor(x => x.UserName);
        result.ShouldHaveValidationErrorFor(x => x.Email);
    }
}
