using FluentValidation;

namespace Backend.Validators.Supplier;

public class UpdateSupplierDtoValidator : AbstractValidator<UpdateSupplierDto>
{
    public UpdateSupplierDtoValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Supplier name is required")
            .MaximumLength(100).WithMessage("Name cannot exceed 100 characters");

        RuleFor(x => x.Email)
            .EmailAddress().WithMessage("Invalid email format")
            .MaximumLength(100).WithMessage("Email cannot exceed 100 characters")
            .When(x => !string.IsNullOrWhiteSpace(x.Email));

        RuleFor(x => x.Phone)
            .Matches(@"^[\d\s\-\+\(\)]+$").WithMessage("Invalid phone number format")
            .MinimumLength(7).WithMessage("Phone number is too short")
            .MaximumLength(20).WithMessage("Phone number is too long")
            .When(x => !string.IsNullOrWhiteSpace(x.Phone));
    }
}
