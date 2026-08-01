

using FluentValidation;

public class CreateMedicineValidator : AbstractValidator<CreateMedicineDto>
{
    public CreateMedicineValidator()
    {
        RuleFor(x => x.Name)
        .NotEmpty()
        .MaximumLength(100);

        RuleFor(x => x.Price)
        .GreaterThan(0)
        .PrecisionScale(10, 2, true);

        RuleFor(x => x.Quantity)
        .GreaterThanOrEqualTo(0);

    }

}