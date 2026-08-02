using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using AutoMapper;
using Backend.Services;
using Hayat.Backend.Configurations;
using Hayat.Backend.Dtos.Medicine;

namespace Backend.Tests.Services;

/// <summary>
/// Medicine images are stored in the database rather than on disk.
///
/// The filesystem in a hosted container is ephemeral: the free Render tier discards it
/// on redeploy, on restart, and whenever the service spins down after fifteen idle
/// minutes. Uploaded images therefore disappeared within minutes of the last visitor,
/// while the medicine rows carried on pointing at them.
/// </summary>
public class MedicineImageStorageTests
{
    private static PharmacyDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static MedicineService CreateService(PharmacyDbContext context)
    {
        var mapper = new MapperConfiguration(
            cfg => cfg.CreateMap<Medicine, MedicineDto>(),
            NullLoggerFactory.Instance).CreateMapper();

        return new MedicineService(
            context,
            Mock.Of<INotificationService>(),
            Mock.Of<ILogger<MedicineService>>(),
            mapper,
            Mock.Of<IWebHostEnvironment>(),
            new PricingService(Options.Create(new PricingSettings
            {
                MarkupTiers = new List<MarkupTier> { new() { UpToCost = 1000m, MarkupPercent = 20m } },
                DefaultMarkupPercent = 10m
            })));
    }

    /// <summary>A believable upload: real bytes, a filename, and a declared content type.</summary>
    private static IFormFile FakeUpload(
        string fileName = "pill.png",
        string contentType = "image/png",
        byte[]? content = null)
    {
        var bytes = content ?? new byte[] { 0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4 };
        var stream = new MemoryStream(bytes);
        return new FormFile(stream, 0, bytes.Length, "Image", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };
    }

    // ── Storage ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_StoresTheImageBytesInTheDatabase()
    {
        using var context = CreateContext();
        var service = CreateService(context);
        var bytes = new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9 };

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Paracetamol",
            Price = 10m,
            Quantity = 5,
            Image = FakeUpload(content: bytes)
        });

        var stored = await context.MedicineImages.SingleAsync();
        Assert.Equal(created.Id, stored.MedicineId);
        Assert.Equal(bytes, stored.Data);
        Assert.Equal("image/png", stored.ContentType);
    }

    [Fact]
    public async Task CreateAsync_PointsTheMedicineAtTheServingEndpoint()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Ibuprofen", Price = 8m, Quantity = 3, Image = FakeUpload()
        });

        // Relative on purpose: the client resolves it against its configured API base.
        Assert.StartsWith($"/api/Medicine/{created.Id}/image", created.Image);
    }

    [Fact]
    public async Task CreateAsync_StoresNoImageRow_WhenNoneIsUploaded()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "No Picture", Price = 4m, Quantity = 1
        });

        Assert.Null(created.Image);
        Assert.Empty(context.MedicineImages);
    }

    [Fact]
    public async Task GetImageAsync_ReturnsTheBytesAndTheContentType()
    {
        using var context = CreateContext();
        var service = CreateService(context);
        var bytes = new byte[] { 10, 20, 30 };

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Aspirin", Price = 6m, Quantity = 2,
            Image = FakeUpload("shot.webp", "image/webp", bytes)
        });

        var image = await service.GetImageAsync(created.Id);

        Assert.NotNull(image);
        Assert.Equal(bytes, image!.Value.Data);
        Assert.Equal("image/webp", image.Value.ContentType);
    }

    [Fact]
    public async Task GetImageAsync_IsNull_ForAMedicineWithoutOne()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Bare", Price = 1m, Quantity = 1
        });

        Assert.Null(await service.GetImageAsync(created.Id));
    }

    [Fact]
    public async Task GetImageAsync_IsNull_ForAnUnknownMedicine()
    {
        using var context = CreateContext();
        Assert.Null(await CreateService(context).GetImageAsync(999_999));
    }

    // ── Replacing ────────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateAsync_ReplacesTheImageInPlace_WithoutLeavingTheOldOne()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Replaceable", Price = 9m, Quantity = 4,
            Image = FakeUpload(content: new byte[] { 1, 1, 1 })
        });

        await service.UpdateAsync(created.Id, new UpdateMedicineDto
        {
            Name = "Replaceable", Price = 9m, Quantity = 4,
            Image = FakeUpload("new.jpg", "image/jpeg", new byte[] { 2, 2, 2, 2 })
        });

        // One row per medicine: replacing overwrites rather than accumulating.
        var stored = await context.MedicineImages.SingleAsync();
        Assert.Equal(new byte[] { 2, 2, 2, 2 }, stored.Data);
        Assert.Equal("image/jpeg", stored.ContentType);
    }

    [Fact]
    public async Task UpdateAsync_ChangesTheImageUrl_SoACachedCopyIsNotShown()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Cache Buster", Price = 3m, Quantity = 1, Image = FakeUpload()
        });
        var originalUrl = created.Image;

        await Task.Delay(10); // distinct upload timestamp
        var updated = await service.UpdateAsync(created.Id, new UpdateMedicineDto
        {
            Name = "Cache Buster", Price = 3m, Quantity = 1,
            Image = FakeUpload("second.png", "image/png", new byte[] { 9, 9 })
        });

        Assert.NotEqual(originalUrl, updated!.Image);
    }

    [Fact]
    public async Task UpdateAsync_LeavesTheExistingImage_WhenNoNewOneIsSent()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Keep", Price = 5m, Quantity = 2,
            Image = FakeUpload(content: new byte[] { 7, 7, 7 })
        });

        await service.UpdateAsync(created.Id, new UpdateMedicineDto
        {
            Name = "Keep Renamed", Price = 5m, Quantity = 2  // no Image
        });

        var stored = await context.MedicineImages.SingleAsync();
        Assert.Equal(new byte[] { 7, 7, 7 }, stored.Data);
    }

    // ── Upload restrictions ──────────────────────────────────────────────────

    [Fact]
    public async Task CreateAsync_RejectsADisallowedContentType()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        // An SVG served back same-origin would execute script - stored XSS.
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(new CreateMedicineDto
            {
                Name = "Hostile", Price = 1m, Quantity = 1,
                Image = FakeUpload("payload.svg", "image/svg+xml")
            }));
    }

    [Fact]
    public async Task CreateAsync_RejectsADisallowedExtension()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(new CreateMedicineDto
            {
                Name = "Hostile", Price = 1m, Quantity = 1,
                Image = FakeUpload("payload.html", "image/png")
            }));
    }

    [Fact]
    public async Task CreateAsync_RejectsAnOversizedUpload()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(new CreateMedicineDto
            {
                Name = "Huge", Price = 1m, Quantity = 1,
                Image = FakeUpload(content: new byte[6 * 1024 * 1024])
            }));
    }

    [Fact]
    public async Task CreateAsync_SavesNoMedicine_WhenTheImageIsRejected()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(new CreateMedicineDto
            {
                Name = "Orphan", Price = 1m, Quantity = 1,
                Image = FakeUpload("payload.svg", "image/svg+xml")
            }));

        // Validation runs before the insert: a rejected image must not leave a
        // half-created medicine behind.
        Assert.Empty(context.Medicines);
    }

    [Fact]
    public async Task StoredContentType_IsCanonical_NotWhateverTheClientClaimed()
    {
        using var context = CreateContext();
        var service = CreateService(context);

        // image/pjpeg is a legacy alias; it must be normalised, so what gets echoed
        // back in a Content-Type header is always one of the five allowed values.
        var created = await service.CreateAsync(new CreateMedicineDto
        {
            Name = "Legacy", Price = 2m, Quantity = 1,
            Image = FakeUpload("legacy.jpg", "image/pjpeg")
        });

        var stored = await context.MedicineImages.SingleAsync();
        Assert.Equal("image/jpeg", stored.ContentType);
        Assert.NotNull(created.Image);
    }
}
