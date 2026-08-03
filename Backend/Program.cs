using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.OpenApi.Models;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Backend.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Hosted platforms (Render, Railway, Fly, Heroku) hand the container a port in $PORT
// and route to it. Without this the app listens on its own default and the platform
// reports the deploy as unhealthy.
var assignedPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(assignedPort))
{
    builder.WebHost.UseUrls($"http://+:{assignedPort}");
}

// Bind JwtSettings from configuration to an instance
var jwtSettings = builder.Configuration
                        .GetSection("JwtSettings")
                        .Get<JwtSettings>() ?? throw new Exception("JWT settings not configured");

// The signing key is the whole of the API's security: anyone holding it can mint a
// token for any role. Outside Development, refuse to start on a key that is missing,
// short, or one of the values that has ever been committed to this repository.
// Failing at start-up is loud; a weak key in production is silent.
ValidateSigningKey(
    jwtSettings.Key,
    builder.Environment.IsDevelopment(),
    DescribeConfigSource(builder.Configuration, "JwtSettings:Key"));

/// <summary>
/// Names the configuration provider a value actually came from.
///
/// Telling someone "your key is wrong" is not much help when they have already fixed it
/// in the place they know about: an environment variable silently outranks user-secrets,
/// and a shell started before the variable was removed keeps its own copy, so the fix
/// appears to do nothing. Reporting the winning provider turns that from a guessing game
/// into a fact.
///
/// Providers are consulted in order and the last one holding the key wins, so this walks
/// them backwards and reports the first hit.
/// </summary>
static string DescribeConfigSource(IConfiguration configuration, string key)
{
    if (configuration is not IConfigurationRoot root) return "unknown source";

    foreach (var provider in root.Providers.Reverse())
    {
        if (provider.TryGet(key, out _))
            return provider.GetType().Name;
    }

    return "no provider";
}

static void ValidateSigningKey(string? key, bool isDevelopment, string source)
{
    // Anything ever exposed in source control or in a public artifact. Rotating away
    // from these is mandatory - see DEPLOYMENT.md.
    string[] burned =
    {
        "HayaaPharmacyMostSecretKeyEverCreated!",
        "HayatPharmacyMostSecretKeyEverCreated!"
    };

    if (string.IsNullOrWhiteSpace(key))
        throw new InvalidOperationException(
            "JwtSettings:Key is not configured. Set the JwtSettings__Key environment variable.");

    if (burned.Contains(key))
        throw new InvalidOperationException(
            $"JwtSettings:Key is a known-compromised value from this repository's history, " +
            $"and it is coming from: {source}.\n" +
            "If that says EnvironmentVariablesConfigurationProvider, the variable is winning " +
            "over user-secrets - environment variables outrank them. Clear it in every scope:\n" +
            "  [Environment]::SetEnvironmentVariable('JwtSettings__Key', $null, 'User')\n" +
            "  [Environment]::SetEnvironmentVariable('JwtSettings__Key', $null, 'Machine')\n" +
            "  $env:JwtSettings__Key = $null\n" +
            "A shell started before the variable was removed keeps its own stale copy in " +
            "memory, so close every terminal and your IDE afterwards - reopening a tab is not " +
            "enough, the parent process passes the old value to each new child.");

    if (isDevelopment) return;

    // HMAC-SHA256 keys shorter than the 256-bit hash output weaken the signature, and
    // .NET refuses them outright. 32 bytes of UTF-8 is the floor; 64 is the recommendation.
    if (System.Text.Encoding.UTF8.GetByteCount(key) < 32)
        throw new InvalidOperationException(
            "JwtSettings:Key must be at least 32 bytes (use 64+). Generate one with: openssl rand -base64 48");

    if (key.Distinct().Count() < 16)
        throw new InvalidOperationException(
            "JwtSettings:Key has too little variety to be a random key. Generate one with: openssl rand -base64 48");
}

// Add services
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
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
builder.Services.AddIdentity<AppUser, IdentityRole>(options =>
{
    // Lockout: AuthController signs in via CheckPasswordSignInAsync(lockoutOnFailure: true),
    // so these limits actually throttle password guessing.
    options.Lockout.AllowedForNewUsers = true;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);

    options.Password.RequiredLength = 8;
    options.Password.RequireDigit = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = true;

    options.User.RequireUniqueEmail = true;
})
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

// Behind a platform load balancer the app sees plain HTTP from an arbitrary internal
// address. Without trusting the forwarded headers, UseHttpsRedirection sees "http",
// redirects, the proxy forwards the redirect back as http, and the browser loops.
// The default only trusts loopback proxies, so the known lists must be cleared - the
// platform edge is the only ingress, so nothing else can reach the container to spoof them.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// CORS - allowed origins come from configuration (Cors:AllowedOrigins) so a deployed
// environment can point at its real frontend host instead of hardcoded localhost ports.
// SignalR needs AllowCredentials(), which cannot be combined with AllowAnyOrigin(),
// so the origin list must always be explicit - never "*".
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();

if (corsOrigins is null || corsOrigins.Length == 0)
{
    corsOrigins = builder.Environment.IsDevelopment()
        ? new[]
        {
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://127.0.0.1:3002"
        }
        : throw new InvalidOperationException(
            "Cors:AllowedOrigins must be configured outside Development. Refusing to start with no allowed origins.");
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AppCors", policy =>
    {
        policy
            .WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();              // Required for SignalR WebSockets
    });
});



var app = builder.Build();

// Global exception handler - must be first so it wraps everything downstream.
app.UseMiddleware<ErrorHandlingMiddleware>();

// Must run before anything reads the scheme or the client address.
app.UseForwardedHeaders();

// Tells browsers to refuse plain HTTP to this host on every later visit. The platform
// edge already terminates TLS; this closes the first-request gap it cannot.
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseStaticFiles();
app.UseHttpsRedirection();

// Liveness probe. Anonymous and dependency-free on purpose: hosting platforms poll it
// to decide whether the deploy succeeded, and a probe that needs the database would
// report the whole service dead during a transient database blip.
app.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }))
   .AllowAnonymous();

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
app.UseCors("AppCors");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<NotificationsHub>("/hubs/notifications");

app.Run();
