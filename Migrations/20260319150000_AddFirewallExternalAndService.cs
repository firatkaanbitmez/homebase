using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HomeBase.API.Migrations
{
    public partial class AddFirewallExternalAndService : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsExternal",
                table: "FirewallRules",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceComposeName",
                table: "FirewallRules",
                type: "text",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "IsExternal", table: "FirewallRules");
            migrationBuilder.DropColumn(name: "ServiceComposeName", table: "FirewallRules");
        }
    }
}
