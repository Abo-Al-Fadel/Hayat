using Hayat.Backend.Dtos.Medicine;

public interface IMedicineService
{
    /// <summary>
    /// Lists medicines. Paging is opt-in: when <paramref name="page"/> and
    /// <paramref name="pageSize"/> are both null the full filtered set is returned.
    /// </summary>
    Task<IEnumerable<MedicineDto>> GetAllAsync(string? name, decimal? minPrice, decimal? maxPrice, bool includeHidden = true, int? page = null, int? pageSize = null, bool includeCost = false);
    Task<MedicineDto?> GetByIdAsync(int id, bool includeCost = false);
    Task<MedicineDto> CreateAsync(CreateMedicineDto dto);
    Task<MedicineDto?> UpdateAsync(int id, UpdateMedicineDto dto);
    Task<MedicineDto> UpdateNameAsync(int id, string newName);
    Task<string> DeleteAsync(int id);
    Task<List<Medicine>> SearchMedicinesAsync(string name, bool includeHidden = true);
    Task<List<MedicineDto>> GetByCategoryAsync(int categoryId, bool includeHidden = true, bool includeCost = false);
    Task<MedicineDto> ToggleVisibilityAsync(int id, bool isHidden);
}