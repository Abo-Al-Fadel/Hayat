using AutoMapper;
using Hayat.Backend.Dtos.Medicine; // Your DTOs

namespace Backend.Profiles
{
    public class MedicineProfile : Profile
    {
        public MedicineProfile()
        {
            CreateMap<CreateMedicineDto, Medicine>()
            .ForMember(dest => dest.Image, opt => opt.Ignore());
            // Entity → DTO.
            // Cost fields are deliberately NOT auto-mapped: they are Admin-only and are
            // populated explicitly by MedicineService when the caller is allowed to see them.
            CreateMap<Medicine, MedicineDto>()
                .ForMember(dest => dest.CostPrice, opt => opt.Ignore())
                .ForMember(dest => dest.MarkupPercent, opt => opt.Ignore());

            // DTO → Entity
            CreateMap<CreateMedicineDto, Medicine>();
            CreateMap<UpdateMedicineDto, Medicine>();
        }
    }
}
