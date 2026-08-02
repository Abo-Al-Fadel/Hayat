namespace Hayat.Backend.Models;

/// <summary>
/// An uploaded medicine image, stored as bytes in the database.
///
/// Images used to be written to wwwroot. On a hosted container that filesystem is
/// ephemeral - the free Render tier discards it whenever the service redeploys,
/// restarts, or spins down after fifteen idle minutes - so uploaded images vanished
/// within minutes of the last visitor while the medicine rows kept pointing at them.
///
/// This lives in its own table rather than as a column on Medicine so the bytes are
/// never dragged along by ordinary catalogue queries: nothing loads a MedicineImage
/// unless it is explicitly asked for, which is only the endpoint that serves it.
///
/// Object storage (R2, S3, Cloudinary) is the conventional answer and would be the
/// right call at scale. At a few dozen images against 32 GB of free database, this
/// removes an entire external dependency instead.
/// </summary>
public class MedicineImage
{
    /// <summary>Primary key and foreign key: one image per medicine.</summary>
    public int MedicineId { get; set; }

    public Medicine Medicine { get; set; } = null!;

    /// <summary>Canonical MIME type, from the upload allowlist - never client-supplied text.</summary>
    public string ContentType { get; set; } = string.Empty;

    public byte[] Data { get; set; } = Array.Empty<byte>();

    /// <summary>Doubles as the cache-busting token in the image URL.</summary>
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}
