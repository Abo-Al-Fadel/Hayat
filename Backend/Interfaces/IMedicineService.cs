using Hayaa.Backend.Dtos.Medicine;

public interface IMedicineService
{
    Task<IEnumerable<MedicineDto>> GetAllAsync(string? name, decimal? minPrice, decimal? maxPrice, bool includeHidden = true);
    Task<MedicineDto?> GetByIdAsync(int id);
    Task<MedicineDto> CreateAsync(CreateMedicineDto dto);
    Task<MedicineDto?> UpdateAsync(int id, UpdateMedicineDto dto);
    Task<MedicineDto> UpdateNameAsync(int id, string newName);
    Task<string> DeleteAsync(int id);
    Task<List<Medicine>> SearchMedicinesAsync(string name, bool includeHidden = true);
    Task<List<MedicineDto>> GetByCategoryAsync(int categoryId, bool includeHidden = true);
    Task<MedicineDto> ToggleVisibilityAsync(int id, bool isHidden);
}