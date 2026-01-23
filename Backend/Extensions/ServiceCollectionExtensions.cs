using Backend.Profiles;
using Backend.Services;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Internal;
using System.Text.Json;


public static class ServiceCollectionExtensions 
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services, IConfiguration config)
    {
        services.AddDbContext<PharmacyDbContext>(options =>
                options.UseSqlServer(config.GetConnectionString("DefaultConnection")));
                
        services.AddScoped<IMedicineService, MedicineService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<INotificationManagerService, NotificationManagerService>();
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<ISupplyOrderService, SupplyOrderService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<ISupplierService, SupplierService>();
        
        // SignalR with camelCase serialization for frontend compatibility
        services.AddSignalR()
            .AddJsonProtocol(options =>
            {
                options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            });
        
        services.AddFluentValidationAutoValidation();
        services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
        services.AddValidatorsFromAssembly(typeof(CreateMedicineDto).Assembly);
        return services;
    }
}

