using Microsoft.AspNetCore.Identity;
using Moq;
using Xunit;

namespace Backend.Tests.Services;

/// <summary>
/// Which roles an existing user may be moved to.
///
/// This is the third place the set of roles is written down - AppRole, the create-user
/// path, and here - and it is the copy that was never updated when HR was added. The
/// admin dashboard offers "HR (view-only)" in the role dropdown on every row, so the
/// control existed and simply failed: the server rejected the value as invalid and the
/// UI showed axios's generic "Request failed with status code 400".
///
/// The list is now derived from AppRole rather than retyped, so the next role added
/// cannot drift out of sync again. These tests pin that down.
/// </summary>
public class UserRoleAssignmentTests
{
    private static UserService CreateServiceWithNoSuchUser()
    {
        // The role check runs before the user lookup, so a store that finds nobody is
        // enough to tell "rejected the role" apart from "got past the role check".
        var userStore = new Mock<IUserStore<AppUser>>();
        var userManager = new Mock<UserManager<AppUser>>(
            userStore.Object, null!, null!, null!, null!, null!, null!, null!, null!);
        userManager.Setup(m => m.FindByIdAsync(It.IsAny<string>())).ReturnsAsync((AppUser?)null);

        var roleStore = new Mock<IRoleStore<IdentityRole>>();
        var roleManager = new Mock<RoleManager<IdentityRole>>(
            roleStore.Object, null!, null!, null!, null!);

        return new UserService(userManager.Object, roleManager.Object);
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Pharmacist")]
    [InlineData("StorageManager")]
    [InlineData("HR")]
    public async Task UpdateUserRoleAsync_DoesNotRejectARealRoleAsInvalid(string role)
    {
        var service = CreateServiceWithNoSuchUser();

        var thrown = await Record.ExceptionAsync(
            () => service.UpdateUserRoleAsync("no-such-user", role, "current-admin"));

        // It must fail on the missing user, not on the role. An ArgumentException here
        // means the role itself was refused - which is what HR used to hit.
        Assert.IsNotType<ArgumentException>(thrown);
        Assert.Contains("not found", thrown!.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UpdateUserRoleAsync_StillRejectsARoleThatDoesNotExist()
    {
        var service = CreateServiceWithNoSuchUser();

        var thrown = await Assert.ThrowsAsync<ArgumentException>(
            () => service.UpdateUserRoleAsync("no-such-user", "Superuser", "current-admin"));

        Assert.Contains("Invalid role", thrown.Message);
    }

    [Fact]
    public void EveryAppRoleIsAssignable()
    {
        // The guard against this drifting a second time: if a role is added to AppRole
        // and the assignable set is hand-maintained again, this fails.
        Assert.Equal(
            Enum.GetNames<AppRole>().OrderBy(r => r).ToArray(),
            UserService.AssignableRoles.OrderBy(r => r).ToArray());
    }
}
