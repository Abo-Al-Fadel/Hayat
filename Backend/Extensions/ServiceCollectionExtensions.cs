using Backend.Services;
using FluentValidation;
using Hayat.Backend.Configurations;
using Hayat.Backend.Interfaces;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using AutoMapper;
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
        services.AddScoped<IPricingService, PricingService>();
        services.AddScoped<IStatsService, StatsService>();

        // Retail markup tiers / dispensing fee - see appsettings "Pricing".
        services.Configure<PricingSettings>(config.GetSection(PricingSettings.SectionName));

        // SignalR with camelCase serialization for frontend compatibility
        services.AddSignalR()
            .AddJsonProtocol(options =>
            {
                options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            });

        services.AddFluentValidationAutoValidation();
        services.AddAutoMapper(cfg => cfg.AddMaps(typeof(Program).Assembly));
        services.AddValidatorsFromAssembly(typeof(CreateMedicineDto).Assembly);
        return services;
    }
}

