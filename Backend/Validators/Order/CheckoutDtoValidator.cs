using FluentValidation;

public class CheckoutDtoValidator : AbstractValidator<CheckoutDto>
{
    public CheckoutDtoValidator()
    {
        RuleFor(x => x.Items)
            .NotEmpty().WithMessage("Checkout must contain at least one order item.");

        RuleForEach(x => x.Items)
            .SetValidator(new OrderItemDtoValidator());

    }
}
