using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Configurations
{
    public class OrderItemConfiguration : IEntityTypeConfiguration<OrderItem>
    {
        public void Configure(EntityTypeBuilder<OrderItem> entity)
        {
            entity.Property(oi => oi.Quantity)
                .IsRequired();

            entity.Property(oi => oi.Price)
                .IsRequired()
                .HasPrecision(18, 2);

            entity.HasOne(oi => oi.Medicine)
                .WithMany()
                .HasForeignKey(oi => oi.MedicineId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
