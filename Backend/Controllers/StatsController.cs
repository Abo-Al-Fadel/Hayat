using Hayat.Backend.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

/// <summary>Financial reporting. Money figures are Admin-only.</summary>
[ApiController]
[Route("api/[controller]")]
// Authentication only - see the note in SupplierController about cumulative
// [Authorize] attributes. Money is readable by Admin and the read-only HR observer;
// nothing here writes anything.
[Authorize]
public class StatsController : ControllerBase
{
    private readonly IStatsService _stats;
    private readonly IPricingService _pricing;

    public StatsController(IStatsService stats, IPricingService pricing)
    {
        _stats = stats;
        _pricing = pricing;
    }

    /// <param name="days">Rolling window ending now. Ignored when from/to are supplied.</param>
    [HttpGet("financial")]
    [Authorize(Roles = Roles.CanReadFinancials)]
    public async Task<IActionResult> GetFinancial(
        [FromQuery] int days = 30,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int topMedicines = 5)
    {
        var toUtc = to?.ToUniversalTime() ?? DateTime.UtcNow;
        var fromUtc = from?.ToUniversalTime() ?? toUtc.AddDays(-Math.Clamp(days, 1, 3650));

        if (fromUtc > toUtc)
            return BadRequest(new { error = "'from' must not be after 'to'." });

        var result = await _stats.GetFinancialStatsAsync(fromUtc, toUtc, topMedicines);
        return Ok(result);
    }

    /// <summary>
    /// Suggested retail price for a given supplier unit cost, using the configured
    /// regressive markup tiers. Lets the Admin price a new medicine consistently.
    /// </summary>
    [HttpGet("suggest-price")]
    [Authorize(Roles = Roles.CanReadFinancials)]
    public IActionResult SuggestPrice([FromQuery] decimal cost)
    {
        if (cost < 0)
            return BadRequest(new { error = "Cost cannot be negative." });

        var markupPercent = _pricing.GetMarkupPercent(cost);
        var suggested = _pricing.SuggestSellPrice(cost);

        return Ok(new
        {
            cost,
            markupPercent,
            suggestedPrice = suggested,
            marginPercent = _pricing.CalculateMarginPercent(cost, suggested)
        });
    }

    /// <summary>
    /// Suggested purchase (supplier) price for an item that retails at
    /// <paramref name="sellPrice"/>, for an order of <paramref name="quantity"/> units.
    ///
    /// Works backwards through the markup tiers, then applies the bulk discount, so the
    /// buy price is always below the sell price and falls as the order grows. The supply
    /// order form previously defaulted the purchase price to the retail price, which
    /// implied a zero margin on every restock.
    /// </summary>
    /// <summary>Largest order this endpoint will price. No pharmacy orders more.</summary>
    public const int MaxOrderQuantity = 1_000_000;

    [HttpGet("suggest-purchase-price")]
    [Authorize(Roles = Roles.CanReadFinancials)]
    // Bound as long, not int: a quantity above int.MaxValue used to fail model binding
    // before reaching this method, producing a framework 400 with no usable message -
    // so the UI simply lost the price with nothing to show the user. Taking a long lets
    // an out-of-range value be rejected here, with a reason.
    public IActionResult SuggestPurchasePrice([FromQuery] decimal sellPrice, [FromQuery] long quantity = 1)
    {
        if (sellPrice < 0)
            return BadRequest(new { error = "Sell price cannot be negative." });
        if (quantity < 1)
            return BadRequest(new { error = "Quantity must be at least 1." });
        if (quantity > MaxOrderQuantity)
            return BadRequest(new { error = $"Quantity cannot exceed {MaxOrderQuantity:N0} units." });

        var order = (int)quantity;  // safe: bounded above
        var basePrice = _pricing.SuggestPurchasePrice(sellPrice);
        var discountPercent = _pricing.GetVolumeDiscountPercent(order);
        var unitPrice = _pricing.SuggestPurchasePrice(sellPrice, order);

        return Ok(new
        {
            sellPrice,
            quantity,
            basePurchasePrice = basePrice,
            volumeDiscountPercent = discountPercent,
            suggestedUnitPrice = unitPrice,
            totalCost = Math.Round(unitPrice * quantity, 2, MidpointRounding.AwayFromZero),
            savingsVsBase = Math.Round((basePrice - unitPrice) * quantity, 2, MidpointRounding.AwayFromZero),
            marginPercent = _pricing.CalculateMarginPercent(unitPrice, sellPrice)
        });
    }
}
