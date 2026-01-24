using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplyOrderNotificationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NewStatus",
                table: "Notifications",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OldStatus",
                table: "Notifications",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SupplyOrderId",
                table: "Notifications",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SupplyOrderName",
                table: "Notifications",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NewStatus",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "OldStatus",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "SupplyOrderId",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "SupplyOrderName",
                table: "Notifications");
        }
    }
}
