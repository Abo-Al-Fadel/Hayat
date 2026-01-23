

using FluentValidation;

public class LoginValidator : AbstractValidator<LoginDto>
{
    public LoginValidator()
    {
        RuleFor(x=> x.UserName)
        .NotEmpty();
        RuleFor(x => x.Password)
        .NotEmpty();

    }
}