public enum AppRole
{
    Admin,
    Pharmacist,
    StorageManager,

    /// <summary>
    /// Read-only observer. Sees every page, changes nothing.
    ///
    /// Enforced on the server, not by hiding buttons: see <see cref="Roles"/>. HR must
    /// never appear in a Can-write policy, and a reflection test over every controller
    /// action asserts exactly that.
    /// </summary>
    HR
}

/// <summary>
/// Role policies, named for what they permit rather than who holds them.
///
/// Endpoints reference these constants instead of literal role strings, so the read/
/// write split is stated in one place and can be audited at a glance. The read-only
/// HR role appears only in Can-read policies - if it ever shows up in a Can-write one,
/// RoleAuthorizationTests fails.
///
/// A caution that has already caused one production bug here: multiple [Authorize]
/// attributes are cumulative (AND-ed), so a controller-level role list silently
/// narrows every action beneath it. Controllers therefore carry a bare [Authorize]
/// for authentication, and each action declares its own policy.
/// </summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string Pharmacist = "Pharmacist";
    public const string StorageManager = "StorageManager";
    public const string HR = "HR";

    // ── Read policies. HR belongs in these and nowhere else. ──────────────────

    /// <summary>Catalogue, categories, orders, invoices, stock, suppliers, statistics.</summary>
    public const string CanReadCatalogue = "Admin,Pharmacist,HR";
    public const string CanReadCategories = "Admin,Pharmacist,StorageManager,HR";
    public const string CanReadOrders = "Admin,Pharmacist,HR";
    public const string CanReadStock = "Admin,StorageManager,Pharmacist,HR";

    /// <summary>Low-stock alerts are an operational view; a pharmacist has no use for it.</summary>
    public const string CanReadLowStock = "Admin,StorageManager,HR";
    public const string CanReadSupply = "Admin,StorageManager,HR";
    public const string CanReadSuppliers = "Admin,HR";
    public const string CanReadUsers = "Admin,HR";
    public const string CanReadFinancials = "Admin,HR";

    // ── Write policies. Adding HR to any of these is a bug. ───────────────────

    public const string CanManageCatalogue = "Admin";
    public const string CanManageCategories = "Admin";
    public const string CanManageUsers = "Admin";
    public const string CanManageSuppliers = "Admin";
    public const string CanSell = "Admin,Pharmacist";
    public const string CanAdjustStock = "Admin,StorageManager";
    public const string CanOrderSupply = "Admin";
    public const string CanReceiveSupply = "StorageManager";
    public const string CanAdvanceSupply = "Admin,StorageManager";
    public const string CanManageOwnNotifications = "Admin,Pharmacist,StorageManager";
}
