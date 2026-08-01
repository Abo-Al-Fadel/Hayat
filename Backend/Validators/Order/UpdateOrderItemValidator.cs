

using FluentValidation;

public class UpdateOrderItemValidator : AbstractValidator<UpdateOrderItemDto>
{
    public UpdateOrderItemValidator()
    {
        // Must match OrderService.UpdateOrderItemQuantityAsync, which rejects 0.
        // Removing a line item is done via DELETE /api/Order/{orderId}/item/{itemId}.
        RuleFor(x => x.Quantity)
        .GreaterThan(0).WithMessage("Quantity must be at least 1.");
    }
}