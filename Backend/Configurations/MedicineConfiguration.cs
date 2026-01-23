using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Configurations
{
    public class MedicineConfiguration : IEntityTypeConfiguration<Medicine>
    {
        public void Configure(EntityTypeBuilder<Medicine> entity)
    {
            entity.Property(m => m.Name)
            .IsRequired()
            .HasMaxLength(100);

            entity.Property(m => m.Price)
            .IsRequired()
            .HasPrecision(18, 2);
            
            entity.Property(m => m.Quantity)
                .IsRequired();
    }

    } 
}