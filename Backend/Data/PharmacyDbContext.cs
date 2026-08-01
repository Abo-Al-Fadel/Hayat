using Hayat.Backend.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

public class PharmacyDbContext : IdentityDbContext<AppUser>
{
    public PharmacyDbContext(DbContextOptions<PharmacyDbContext> options) : base(options) { }
    public DbSet<Medicine> Medicines { get; set; }
    public DbSet<Category> Categories { get; set; }
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<Notification> Notifications { get; set; }
    public DbSet<Stock> Stocks { get; set; }
    public DbSet<SupplyOrder> SupplyOrders { get; set; }
    public DbSet<SupplyOrderItem> SupplyOrderItems { get; set; }
    public DbSet<Supplier> Suppliers { get; set; }
    public DbSet<PaymentMethod> PaymentMethods { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.ApplyConfigurationsFromAssembly(typeof(PharmacyDbContext).Assembly);

        builder.Entity<Medicine>()
            .HasOne(m => m.Category)
            .WithMany(c => c.Medicines)
            .HasForeignKey(m => m.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);


        builder.Entity<PaymentMethod>().HasData(
            Enum.GetValues<PaymentMethodEnum>()
                .Select(e => new PaymentMethod
                {
                    Id = (int)e,
                    Name = e.ToString()
                })
        );

        builder.Entity<AppUser>(entity =>
        {
            entity.Property(u => u.UserName)
                  .IsRequired()
                  .HasMaxLength(100);

            entity.Property(u => u.Email)
                  .IsRequired()
                  .HasMaxLength(200);

        });

        builder.Entity<Medicine>(entity =>
    {
        entity.Property(m => m.Name)
              .IsRequired()
              .HasMaxLength(100);

        entity.Property(m => m.Price)
              .IsRequired()
              .HasPrecision(18, 2);

        entity.Property(m => m.CostPrice)
              .IsRequired()
              .HasPrecision(18, 2);

        entity.Property(m => m.Quantity)
              .IsRequired();
    });
        builder.Entity<OrderItem>(entity =>
    {
        entity.Property(o => o.Quantity)
              .IsRequired();

        entity.Property(o => o.Price)
              .HasPrecision(18, 2);

        entity.Property(o => o.CostPrice)
              .IsRequired()
              .HasPrecision(18, 2);
    });
    }
}