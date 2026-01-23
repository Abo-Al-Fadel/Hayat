using AutoMapper;
using Hayaa.Backend.Dtos.Medicine; // Your DTOs

namespace Backend.Profiles
{
    public class MedicineProfile : Profile
    {
        public MedicineProfile()
        {
            CreateMap<CreateMedicineDto, Medicine>()
            .ForMember(dest => dest.Image, opt => opt.Ignore());
            // Entity → DTO
            CreateMap<Medicine, MedicineDto>();

            // DTO → Entity
            CreateMap<CreateMedicineDto, Medicine>();
            CreateMap<UpdateMedicineDto, Medicine>();
        }
    }
}
