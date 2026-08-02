# Hayat Pharmacy API.
#
# Build from the repository root:
#   docker build -t hayat-api .
#   docker run -p 8080:8080 --env-file .env.production hayat-api
#
# Hosting platforms that build from a repo (Render, Railway, Fly) find this file
# automatically. The app reads $PORT when the platform sets one.

# ── Build ──────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Restore first, against project files only, so a source-only change reuses the
# cached package layer instead of re-downloading NuGet on every build.
COPY Backend/Backend.csproj Backend/
RUN dotnet restore Backend/Backend.csproj

COPY Backend/ Backend/
RUN dotnet publish Backend/Backend.csproj \
      -c Release \
      -o /app/publish \
      --no-restore \
      /p:UseAppHost=false

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# MedicineService writes uploaded images to wwwroot/images/medicines at runtime.
# COPY runs as root, so without this the directory is root-owned and the app -
# running unprivileged below - cannot create it or write into it. That surfaces
# as a 500 on "add product", with nothing wrong in the application code.
RUN mkdir -p /app/wwwroot/images/medicines \
    && chown -R $APP_UID /app/wwwroot

# Run unprivileged. A container compromise should not also be root.
# The image ships an `app` user (uid 1654) for exactly this.
USER $APP_UID

# Overridden by $PORT where the platform sets one.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# NOTE: uploaded images live on the container filesystem, which is ephemeral on
# most hosts - they disappear on every redeploy. Mount a persistent disk at
# /app/wwwroot/images/medicines, or move uploads to object storage, if that
# matters. See DEPLOYMENT.md. No VOLUME is declared here: it would create an
# anonymous volume that survives nothing and hides the problem.

ENTRYPOINT ["dotnet", "Backend.dll"]
