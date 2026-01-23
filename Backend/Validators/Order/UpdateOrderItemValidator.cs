

using FluentValidation;

public class UpdateOrderItemValidator : AbstractValidator<UpdateOrderItemDto>
{
    public UpdateOrderItemValidator()
    {
        RuleFor(x => x.Quantity)
        .GreaterThanOrEqualTo(0);
    }
}