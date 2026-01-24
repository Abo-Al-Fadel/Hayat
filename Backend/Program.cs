using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.OpenApi.Models;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Backend.Hubs;

var builder = WebApplication.CreateBuilder(args);
// Bind JwtSettings from configuration to an instance
var jwtSettings = builder.Configuration
                        .GetSection("JwtSettings")
                        .Get<JwtSettings>() ?? throw new Exception("JWT settings not configured");

// Add services
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddApplicationServices(builder.Configuration);
builder.Services.AddSwaggerGen(option =>
{
    option.SwaggerDoc("v1", new OpenApiInfo { Title = "Pharmacy API", Version = "v1" });
    option.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Enter a valid JWT token",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        BearerFormat = "JWT",
        Scheme = "Bearer"
    });
    option.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// Identity
builder.Services.AddIdentity<AppUser, IdentityRole>()
    .AddEntityFrameworkStores<PharmacyDbContext>()
    .AddDefaultTokenProviders();

// JWT Authentication + support access_token for SignalR
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidAudience = jwtSettings.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key)),
        RoleClaimType = ClaimTypes.Role,
        NameClaimType = ClaimTypes.Name
    };

    // Allow SignalR to send token as query string param "access_token"
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"].FirstOrDefault();
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/notifications"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

// Authorization
builder.Services.AddAuthorization();

// CORS - Allow SignalR from React dev server and production
// SignalR requires AllowCredentials() which conflicts with AllowAnyOrigin()
builder.Services.AddCors(options =>
{
    options.AddPolicy("OpenCors", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:3000",      // React dev server
                "http://localhost:3001",      // Alternate React port 1
                "http://localhost:3002",      // Alternate React port 2
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001",
                "http://127.0.0.1:3002"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();              // Required for SignalR WebSockets
    });
});



var app = builder.Build();
app.UseStaticFiles();
app.UseHttpsRedirection();

// DB init - single scoped call
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    await DbInitializer.InitializeAsync(services);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Middleware order
app.UseCors("OpenCors");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationsHub>("/hubs/notifications");

app.Run();
