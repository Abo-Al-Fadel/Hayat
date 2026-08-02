using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

/// <summary>
/// Categories.
///
/// NOTE ON AUTHORIZATION: do not put a controller-level [Authorize(Roles = Roles.CanManageCategories)]
/// here. Multiple [Authorize] attributes are cumulative in ASP.NET Core - a
/// controller-level role requirement is AND-ed with the action-level one, so a
/// broader action attribute cannot widen it. (Only [AllowAnonymous] short-circuits,
/// which is why the previously-anonymous GET appeared to work under a controller-level
/// Admin rule.) Each action therefore declares its own roles.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CategoriesController : ControllerBase
{
    private readonly ICategoryService _service;

    public CategoriesController(ICategoryService service)
    {
        _service = service;
    }

    [HttpPost]
    [Authorize(Roles = Roles.CanManageCategories)]
    public async Task<IActionResult> Create(CreateCategoryDto dto)
        => Ok(await _service.CreateAsync(dto));

    [HttpPut("{id}")]
    [Authorize(Roles = Roles.CanManageCategories)]
    public async Task<IActionResult> Update(int id, UpdateCategoryDto dto)
        => Ok(await _service.UpdateAsync(id, dto));

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.CanManageCategories)]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id);
        return Ok("Category deleted");
    }

    // Readable by every signed-in role - all three dashboards filter by category -
    // but not by anonymous callers.
    [HttpGet]
    [Authorize(Roles = Roles.CanReadCategories)]
    public async Task<IActionResult> GetAll()
        => Ok(await _service.GetAllAsync());
}
