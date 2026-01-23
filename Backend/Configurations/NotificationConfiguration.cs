using Hayaa.Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Backend.Configurations
{
    public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
    {
        public void Configure(EntityTypeBuilder<Notification> entity)
        {
            entity.Property(n => n.TargetRole)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(n => n.MedicineId);

            entity.Property(n => n.Action)
                .IsRequired()
                .HasConversion<string>()
                .HasMaxLength(50);

            entity.Property(n => n.MedicineName)
                .HasMaxLength(100);

            entity.Property(n => n.Message)
                .IsRequired()
                .HasMaxLength(500);

            entity.Property(n => n.CreatedAt)
                .IsRequired();

            entity.Property(n => n.IsRead)
                .HasDefaultValue(false);

            entity.HasIndex(n => n.TargetRole);
            entity.HasIndex(n => n.IsRead);
            entity.HasIndex(n => n.CreatedAt);
        }
    }
}
