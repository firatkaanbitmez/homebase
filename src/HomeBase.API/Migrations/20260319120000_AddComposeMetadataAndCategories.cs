using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace HomeBase.API.Migrations
{
    public partial class AddComposeMetadataAndCategories : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ServiceCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Icon = table.Column<string>(type: "text", nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceCategories", x => x.Id);
                });

            // Seed default categories
            migrationBuilder.InsertData(table: "ServiceCategories", columns: new[] { "Id", "Name", "Icon", "Color", "SortOrder" },
                values: new object[,]
                {
                    { 1, "Media", "film", "#e74c3c", 1 },
                    { 2, "Development", "code", "#3498db", 2 },
                    { 3, "Monitoring", "activity", "#10b981", 3 },
                    { 4, "Productivity", "briefcase", "#f59e0b", 4 },
                    { 5, "Security", "shield", "#ef4444", 5 },
                    { 6, "AI/ML", "cpu", "#8b5cf6", 6 },
                    { 7, "Storage", "database", "#06b6d4", 7 },
                    { 8, "Networking", "globe", "#f97316", 8 }
                });

            migrationBuilder.AddColumn<string>(
                name: "ComposeName",
                table: "Services",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Image",
                table: "Services",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BuildContext",
                table: "Services",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnvFile",
                table: "Services",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsAutoDiscovered",
                table: "Services",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "Services",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Services_CategoryId",
                table: "Services",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Services_ServiceCategories_CategoryId",
                table: "Services",
                column: "CategoryId",
                principalTable: "ServiceCategories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddColumn<string>(
                name: "ServiceComposeName",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPortVariable",
                table: "Settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Settings",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "SettingsHistory",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SettingId = table.Column<int>(type: "integer", nullable: false),
                    OldValue = table.Column<string>(type: "text", nullable: true),
                    NewValue = table.Column<string>(type: "text", nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SettingsHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SettingsHistory_Settings_SettingId",
                        column: x => x.SettingId,
                        principalTable: "Settings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SettingsHistory_SettingId",
                table: "SettingsHistory",
                column: "SettingId");

            // Backfill ComposeName from ContainerName for existing services
            migrationBuilder.Sql("UPDATE \"Services\" SET \"ComposeName\" = \"ContainerName\" WHERE \"ComposeName\" IS NULL");

            // Backfill IsPortVariable for existing settings
            migrationBuilder.Sql("UPDATE \"Settings\" SET \"IsPortVariable\" = true WHERE \"Key\" LIKE '%_PORT'");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SettingsHistory");
            migrationBuilder.DropForeignKey(name: "FK_Services_ServiceCategories_CategoryId", table: "Services");
            migrationBuilder.DropIndex(name: "IX_Services_CategoryId", table: "Services");
            migrationBuilder.DropColumn(name: "ComposeName", table: "Services");
            migrationBuilder.DropColumn(name: "Image", table: "Services");
            migrationBuilder.DropColumn(name: "BuildContext", table: "Services");
            migrationBuilder.DropColumn(name: "EnvFile", table: "Services");
            migrationBuilder.DropColumn(name: "IsAutoDiscovered", table: "Services");
            migrationBuilder.DropColumn(name: "CategoryId", table: "Services");
            migrationBuilder.DropColumn(name: "ServiceComposeName", table: "Settings");
            migrationBuilder.DropColumn(name: "Description", table: "Settings");
            migrationBuilder.DropColumn(name: "IsPortVariable", table: "Settings");
            migrationBuilder.DropColumn(name: "Version", table: "Settings");
            migrationBuilder.DropTable(name: "ServiceCategories");
        }
    }
}
