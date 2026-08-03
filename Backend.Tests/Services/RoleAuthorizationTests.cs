using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Tests.Services;

/// <summary>
/// Walks every controller action by reflection and checks the authorization rules.
///
/// Hand-auditing forty attributes is exactly the job people get wrong, and this
/// codebase has already shipped one such bug: a controller-level [Authorize(Roles=...)]
/// silently narrowed an action that appeared to grant wider access, because multiple
/// [Authorize] attributes are cumulative rather than alternative.
///
/// These tests fail on a new endpoint that forgets its policy, on a controller-level
/// role list that would override its actions, and above all on HR - the read-only
/// observer - appearing anywhere it could change data.
/// </summary>
public class RoleAuthorizationTests
{
    private const string HR = "HR";

    // Anchored on a controller rather than Program, which top-level statements make
    // internal.
    private static IEnumerable<Type> Controllers =>
        typeof(Backend.Controllers.StatsController).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract);

    private record Endpoint(Type Controller, MethodInfo Action, string HttpMethod, string[] Roles, bool Anonymous)
    {
        public string Name => $"{Controller.Name}.{Action.Name}";
    }

    private static string? HttpMethodOf(MethodInfo action) => action.GetCustomAttributes()
        .Select(a => a switch
        {
            HttpGetAttribute => "GET",
            HttpPostAttribute => "POST",
            HttpPutAttribute => "PUT",
            HttpPatchAttribute => "PATCH",
            HttpDeleteAttribute => "DELETE",
            _ => null
        })
        .FirstOrDefault(m => m is not null);

    private static IEnumerable<Endpoint> Endpoints()
    {
        foreach (var controller in Controllers)
        {
            foreach (var action in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var httpMethod = HttpMethodOf(action);
                if (httpMethod is null) continue;

                var anonymous = action.GetCustomAttribute<AllowAnonymousAttribute>() is not null;

                // Cumulative: the effective rule is every [Authorize] on the action AND
                // on its controller. Collect both, exactly as the framework does.
                var roles = action.GetCustomAttributes<AuthorizeAttribute>()
                    .Concat(controller.GetCustomAttributes<AuthorizeAttribute>())
                    .SelectMany(a => (a.Roles ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries))
                    .Select(r => r.Trim())
                    .Distinct()
                    .ToArray();

                yield return new Endpoint(controller, action, httpMethod, roles, anonymous);
            }
        }
    }

    private static bool IsRead(Endpoint e) => e.HttpMethod == "GET";

    [Fact]
    public void EveryEndpointIsAccountedFor()
    {
        // A guard on the guards: if reflection stops finding endpoints, every other
        // test here passes vacuously.
        Assert.True(Endpoints().Count() > 25, $"only found {Endpoints().Count()} endpoints");
    }

    // ── The read-only role ───────────────────────────────────────────────────

    [Fact]
    public void HR_CannotReachAnyWriteEndpoint()
    {
        var writable = Endpoints()
            .Where(e => !IsRead(e) && e.Roles.Contains(HR))
            .Select(e => $"{e.Name} [{e.HttpMethod}]")
            .ToList();

        Assert.True(writable.Count == 0,
            "HR is read-only, but these endpoints would let it change data:\n  " +
            string.Join("\n  ", writable));
    }

    [Fact]
    public void HR_CannotReachAnUnrestrictedWriteEndpoint()
    {
        // An action with no roles at all is open to every authenticated user, which
        // includes HR. Writes must always name their roles.
        var unrestricted = Endpoints()
            .Where(e => !IsRead(e) && !e.Anonymous && e.Roles.Length == 0)
            .Select(e => $"{e.Name} [{e.HttpMethod}]")
            .ToList();

        Assert.True(unrestricted.Count == 0,
            "these write endpoints name no roles, so any signed-in user - including the " +
            "read-only HR observer - can reach them:\n  " + string.Join("\n  ", unrestricted));
    }

    [Fact]
    public void HR_CanReachEveryRead()
    {
        // The whole point of the role: view every page. So every read admits HR.
        //
        // This deliberately checks all reads rather than only the ones an Admin can
        // reach. The narrower "HR sees everything Admin sees" version passed while
        // SupplyOrder/storage-manager was guarded by CanReceiveSupply - a policy naming
        // only StorageManager, so it named no Admin for HR to be compared against, and
        // the rule held vacuously over an endpoint HR could not load.
        //
        // A read with no role list at all is reachable by any authenticated user, HR
        // included, so it satisfies this too.
        var closedToHr = Endpoints()
            .Where(e => IsRead(e) && !e.Anonymous)
            .Where(e => e.Roles.Length > 0 && !e.Roles.Contains(HR))
            .Select(e => $"{e.Name} [{string.Join(",", e.Roles)}]")
            .ToList();

        Assert.True(closedToHr.Count == 0,
            "HR is the read-only observer and must be able to open every page, but " +
            "these reads exclude it:\n  " + string.Join("\n  ", closedToHr));
    }

    // ── General hygiene these rules depend on ────────────────────────────────

    [Fact]
    public void NoControllerCarriesARoleListThatWouldOverrideItsActions()
    {
        // The bug that broke Pharmacist category access: [Authorize] attributes are
        // AND-ed, so a role on the controller narrows every action beneath it and no
        // action-level attribute can widen it back.
        var offenders = Controllers
            .Where(c => c.GetCustomAttributes<AuthorizeAttribute>()
                         .Any(a => !string.IsNullOrWhiteSpace(a.Roles)))
            .Select(c => c.Name)
            .ToList();

        Assert.True(offenders.Count == 0,
            "these controllers carry a class-level role list, which silently narrows " +
            "every action beneath them:\n  " + string.Join("\n  ", offenders));
    }

    [Fact]
    public void EveryControllerCarriesABareAuthorize()
    {
        // The stated convention: a bare [Authorize] on the controller for
        // authentication, and each action declaring its own role policy on top. The
        // bare attribute is what makes a forgotten action fail closed - without it a
        // new action with no attribute is reachable by anyone, signed in or not.
        //
        // Three controllers had drifted off it (Medicine, Order, SupplyOrder). Nothing
        // was reachable that should not have been, because every action there did carry
        // its own policy - but the safety net under them was missing.
        //
        // AuthController is the exception and stays out: it exists to be reached without
        // a token.
        var missing = Controllers
            .Where(c => c.Name != "AuthController")
            .Where(c => c.GetCustomAttributes<AuthorizeAttribute>().All(a => !string.IsNullOrWhiteSpace(a.Roles)))
            .Select(c => c.Name)
            .OrderBy(n => n)
            .ToList();

        Assert.True(missing.Count == 0,
            "these controllers carry no class-level [Authorize], so an action added " +
            "without its own attribute would be publicly reachable:\n  " +
            string.Join("\n  ", missing));
    }

    [Fact]
    public void EveryEndpointIsEitherAuthorizedOrDeliberatelyAnonymous()
    {
        var unprotected = Endpoints()
            .Where(e => !e.Anonymous)
            .Where(e => e.Action.DeclaringType!.GetCustomAttribute<AuthorizeAttribute>() is null
                     && e.Action.GetCustomAttribute<AuthorizeAttribute>() is null)
            .Select(e => $"{e.Name} [{e.HttpMethod}]")
            .ToList();

        Assert.True(unprotected.Count == 0,
            "these endpoints require no authentication and are not marked " +
            "[AllowAnonymous], so they are open by accident:\n  " +
            string.Join("\n  ", unprotected));
    }

    [Fact]
    public void OnlyTheExpectedEndpointsAreAnonymous()
    {
        var anonymous = Endpoints()
            .Where(e => e.Anonymous)
            .Select(e => e.Name)
            .OrderBy(n => n)
            .ToList();

        // Login must be reachable without a token, and images are rendered by <img>
        // tags that cannot send an Authorization header. Anything else appearing here
        // is a hole, so the list is asserted exactly rather than merely contained.
        Assert.Equal(
            new[] { "AuthController.Login", "MedicineController.GetImage" },
            anonymous);
    }

    [Fact]
    public void WritesNeverGrantEveryRole()
    {
        // A policy naming all four roles is indistinguishable from no policy at all.
        var allRoles = new[] { "Admin", "Pharmacist", "StorageManager", HR };

        var tooBroad = Endpoints()
            .Where(e => !IsRead(e) && allRoles.All(r => e.Roles.Contains(r)))
            .Select(e => e.Name)
            .ToList();

        Assert.Empty(tooBroad);
    }

    [Fact]
    public void MoneyEndpointsExcludePharmacistAndStorage()
    {
        // Purchase cost and profit stay with Admin and the read-only observer.
        var leaks = Endpoints()
            .Where(e => e.Controller.Name == "StatsController")
            .Where(e => e.Roles.Contains("Pharmacist") || e.Roles.Contains("StorageManager"))
            .Select(e => e.Name)
            .ToList();

        Assert.Empty(leaks);
    }
}
