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
        // Retry on transient failures. A hosted database is not a local one: a
        // serverless Azure SQL database pauses when idle and rejects connections with
        // error 40613 for up to a minute while it resumes, and failovers and throttling
        // produce similar brief outages. Without this the first request after an idle
        // period fails outright - and start-up migrations bring the whole app down.
        //
        // Anything opening an explicit transaction must run inside
        // Database.CreateExecutionStrategy(), because a retry has to replay the whole
        // transaction rather than resume mid-way. See OrderService.CreateOrderAsync.
        services.AddDbContext<PharmacyDbContext>(options =>
                options.UseSqlServer(
                    config.GetConnectionString("DefaultConnection"),
                    sql => sql
                        .EnableRetryOnFailure(
                            maxRetryCount: 10,
                            maxRetryDelay: TimeSpan.FromSeconds(30),
                            errorNumbersToAdd: null)
                        // A resuming database can leave a command waiting well past the
                        // 30s default.
                        .CommandTimeout(60)));

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

