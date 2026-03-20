using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HomeBase.API.Migrations
{
    /// <inheritdoc />
    public partial class AddDeployStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeployStatus",
                table: "Services",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeployStatus",
                table: "Services");
        }
    }
}
