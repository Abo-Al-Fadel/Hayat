using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class BackfillLowStockThresholdDefault : Migration
    {
        /// <summary>
        /// AddLowStockThreshold introduced the column with a SQL default of 0, and the
        /// intended 30 was only ever applied by a loop that re-ran on every app start
        /// (which also reverted any threshold an Admin set below 30). That loop has been
        /// removed; this migration does the backfill once and fixes the column default so
        /// future rows inserted outside EF get 30 rather than 0.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE [Medicines] SET [LowStockThreshold] = 30 WHERE [LowStockThreshold] = 0;");

            migrationBuilder.AlterColumn<int>(
                name: "LowStockThreshold",
                table: "Medicines",
                type: "int",
                nullable: false,
                defaultValue: 30,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The backfill is not reversed - the original per-row values are not recoverable.
            migrationBuilder.AlterColumn<int>(
                name: "LowStockThreshold",
                table: "Medicines",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 30);
        }
    }
}
