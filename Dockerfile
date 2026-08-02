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

# Run unprivileged. A container compromise should not also be root.
# The image ships a `app` user (uid 1654) for exactly this.
USER $APP_UID

COPY --from=build /app/publish .

# Overridden by $PORT where the platform sets one.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# Uploaded medicine images are written under wwwroot. On a platform with an
# ephemeral filesystem they vanish on redeploy - mount a volume here, or move
# uploads to object storage, if that matters. See DEPLOYMENT.md.
VOLUME ["/app/wwwroot/uploads"]

ENTRYPOINT ["dotnet", "Backend.dll"]
