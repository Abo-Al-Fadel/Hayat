using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class UpdateSupplyOrderItemUnitPrices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // DATA FIX: Update existing SupplyOrderItems where UnitPrice is 0
            // Set UnitPrice to the Medicine.Price as a reasonable default
            // This fixes records created before the UnitPrice column was added
            migrationBuilder.Sql(@"
                UPDATE soi
                SET soi.UnitPrice = m.Price
                FROM SupplyOrderItems soi
                INNER JOIN Medicines m ON soi.MedicineId = m.Id
                WHERE soi.UnitPrice = 0 OR soi.UnitPrice IS NULL
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Cannot safely reverse this - UnitPrice would need to be reset
            // but we don't know original values
        }
    }
}
