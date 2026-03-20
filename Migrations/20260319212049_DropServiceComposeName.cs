using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HomeBase.API.Migrations
{
    /// <inheritdoc />
    public partial class DropServiceComposeName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ServiceComposeName",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "ServiceComposeName",
                table: "FirewallRules");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ServiceComposeName",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceComposeName",
                table: "FirewallRules",
                type: "text",
                nullable: true);
        }
    }
}
