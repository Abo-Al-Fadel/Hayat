// Controllers/MedicineController.cs
using Hayat.Backend.Dtos.Medicine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class MedicineController : ControllerBase
{
    private readonly IMedicineService _medicineService;
    private readonly ILogger<MedicineController> _logger;

    public MedicineController(IMedicineService medicineService, ILogger<MedicineController> logger)
    {
        _medicineService = medicineService;
        _logger = logger;
    }

    [HttpGet]
    [Authorize(Roles = Roles.CanReadCatalogue)]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? name,
        [FromQuery] decimal? minPrice,
        [FromQuery] decimal? maxPrice,
        [FromQuery] int? page,
        [FromQuery] int? pageSize)
    {
        var isAdmin = User.IsInRole("Admin");
        var meds = await _medicineService.GetAllAsync(name, minPrice, maxPrice, includeHidden: isAdmin, page: page, pageSize: pageSize, includeCost: isAdmin);
        return Ok(meds);
    }

    [HttpGet("{id}")]
    [Authorize(Roles = Roles.CanReadCatalogue)]
    public async Task<IActionResult> GetById(int id)
    {
        var med = await _medicineService.GetByIdAsync(id, includeCost: User.IsInRole("Admin"));
        if (med == null) return NotFound();
        return Ok(med);
    }

    /// <summary>
    /// Serves a medicine's uploaded image.
    ///
    /// Anonymous by design. These are rendered with a plain &lt;img src&gt;, which cannot
    /// carry an Authorization header - requiring a token here would simply break every
    /// image. This matches the previous behaviour exactly: the same files were served
    /// from wwwroot as anonymous static content. Nothing confidential lives here; the
    /// prices and costs that do are on the authorised endpoints.
    ///
    /// The Content-Type comes from the upload allowlist, never from the client, so a
    /// file cannot be served back as HTML or SVG and execute in the site's origin.
    /// </summary>
    [HttpGet("{id}/image")]
    [AllowAnonymous]
    [ResponseCache(Duration = 31536000, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> GetImage(int id)
    {
        var image = await _medicineService.GetImageAsync(id);
        if (image is null) return NotFound();

        // Cacheable for a year: the URL carries an upload timestamp, so replacing an
        // image changes the URL rather than the contents behind it.
        return File(image.Value.Data, image.Value.ContentType);
    }

    [HttpPost]
    [Authorize(Roles = Roles.CanManageCatalogue)]
    public async Task<IActionResult> Add([FromForm] CreateMedicineDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        try
        {
            var created = await _medicineService.CreateAsync(dto);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (InvalidOperationException ex)
        {
            // Rejected image upload (type, content type, or size).
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id}")]
    [Authorize(Roles = Roles.CanManageCatalogue)]
    public async Task<IActionResult> Update(int id, [FromForm] UpdateMedicineDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var updated = await _medicineService.UpdateAsync(id, dto);
            if (updated == null) return NotFound();
            return Ok(updated);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            // Rejected image upload (type, content type, or size).
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.CanManageCatalogue)]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var message = await _medicineService.DeleteAsync(id);
            return Ok(new { message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpGet("search")]
    [Authorize(Roles = Roles.CanReadCatalogue)]
    public async Task<IActionResult> Search([FromQuery] string? name)
    {
        var isAdmin = User.IsInRole("Admin");
        var medicines = await _medicineService.SearchMedicinesAsync(name ?? string.Empty, includeHidden: isAdmin, includeCost: isAdmin);
        // "No match" is an empty result set, not a 404.
        return Ok(medicines);
    }
    [HttpGet("by-category/{categoryId}")]
    [Authorize(Roles = Roles.CanReadCatalogue)]
    public async Task<IActionResult> GetByCategory(int categoryId)
    {
        try
        {
            var isAdmin = User.IsInRole("Admin");
            var medicines = await _medicineService.GetByCategoryAsync(categoryId, includeHidden: isAdmin, includeCost: isAdmin);
            // Always an array - an empty category returns [], never a different shape.
            return Ok(medicines);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPatch("{id}/visibility")]
    [Authorize(Roles = Roles.CanManageCatalogue)]
    public async Task<IActionResult> ToggleVisibility(int id, [FromBody] ToggleVisibilityDto dto)
    {
        try
        {
            var updated = await _medicineService.ToggleVisibilityAsync(id, dto.IsHidden);
            return Ok(updated);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpPatch("{id}/name")]
    [Authorize(Roles = Roles.CanManageCatalogue)]
    public async Task<IActionResult> UpdateName(int id, [FromBody] UpdateMedicineNameDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        try
        {
            var updated = await _medicineService.UpdateNameAsync(id, dto.Name);
            return Ok(updated);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }
}

