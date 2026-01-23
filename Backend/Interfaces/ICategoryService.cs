public interface ICategoryService
{
    Task<CategoryDto> CreateAsync(CreateCategoryDto dto);
    Task<CategoryDto> UpdateAsync(int id, UpdateCategoryDto dto);
    Task DeleteAsync(int id);
    Task<List<CategoryDto>> GetAllAsync();
}
