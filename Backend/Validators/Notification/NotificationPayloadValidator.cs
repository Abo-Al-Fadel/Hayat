using FluentValidation;

public class NotificationPayloadValidator : AbstractValidator<NotificationPayLoad>
{
    public NotificationPayloadValidator()
    {
        RuleFor(x => x.Action)
            .NotEmpty()
            .MaximumLength(50);

        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.Message)
            .NotEmpty()
            .MaximumLength(500);

        RuleFor(x => x.Timestamp)
            .LessThanOrEqualTo(DateTime.UtcNow);
    }
}
