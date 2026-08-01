using Hayat.Backend.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

/// <summary>Financial reporting. Money figures are Admin-only.</summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
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
}
