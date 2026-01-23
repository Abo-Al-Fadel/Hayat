using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplyOrderTimestamps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "OrderDate",
                table: "SupplyOrders",
                newName: "CreatedAt");

            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "SupplyOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CancelledAt",
                table: "SupplyOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "SupplyOrders",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "OrderedAt",
                table: "SupplyOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReceivedAt",
                table: "SupplyOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ShippedAt",
                table: "SupplyOrders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StoredAt",
                table: "SupplyOrders",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "SupplyOrders");

            migrationBuilder.DropColumn(
                name: "CancelledAt",
                table: "SupplyOrders");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "SupplyOrders");

            migrationBuilder.DropColumn(
                name: "OrderedAt",
                table: "SupplyOrders");

            migrationBuilder.DropColumn(
                name: "ReceivedAt",
                table: "SupplyOrders");

            migrationBuilder.DropColumn(
                name: "ShippedAt",
                table: "SupplyOrders");

            migrationBuilder.DropColumn(
                name: "StoredAt",
                table: "SupplyOrders");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "SupplyOrders",
                newName: "OrderDate");
        }
    }
}
