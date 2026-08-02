using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
// Authentication only. Do NOT put a role list here: [Authorize] attributes are
// cumulative, so a controller-level role silently narrows every action beneath it and
// no action-level grant can widen it back. Each action states its own policy.
[Authorize]
public class SupplierController : ControllerBase
{
    private readonly ISupplierService _service;

    public SupplierController(ISupplierService service)
    {
        _service = service;
    }

    [HttpPost]
    [Authorize(Roles = Roles.CanManageSuppliers)]
    public async Task<IActionResult> Create(CreateSupplierDto dto)
    {
        // Responds with the whole supplier: the client adds it straight to its list,
        // and a response of { id } alone left every other field undefined there.
        var created = await _service.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = Roles.CanManageSuppliers)]
    public async Task<IActionResult> Update(int id, UpdateSupplierDto dto)
    {
        var updated = await _service.UpdateAsync(id, dto);
        if (updated == null)
            return NotFound("Supplier not found");

        return Ok(updated);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = Roles.CanManageSuppliers)]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await _service.DeleteAsync(id);
        if (!deleted)
            return NotFound("Supplier not found");

        return Ok("Supplier deleted successfully");
    }
    [HttpGet]
    [Authorize(Roles = Roles.CanReadSuppliers)]
    public async Task<IActionResult> GetAll()
    {
        var suppliers = await _service.GetAllAsync();
        return Ok(suppliers);
    }

    [HttpGet("{id}")]
    [Authorize(Roles = Roles.CanReadSuppliers)]
    public async Task<IActionResult> GetById(int id)
    {
        var supplier = await _service.GetByIdAsync(id);
        if (supplier == null)
            return NotFound("Supplier not found");

        return Ok(supplier);
    }

}

