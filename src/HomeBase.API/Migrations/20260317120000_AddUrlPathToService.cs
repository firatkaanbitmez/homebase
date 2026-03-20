using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HomeBase.API.Migrations
{
    /// <inheritdoc />
    public partial class AddUrlPathToService : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UrlPath",
                table: "Services",
                type: "text",
                nullable: true);

            migrationBuilder.Sql(@"
                INSERT INTO ""Services"" (""Name"", ""Description"", ""Icon"", ""Color"", ""ContainerName"", ""UrlPath"", ""IsEnabled"", ""SortOrder"", ""CreatedAt"", ""UpdatedAt"")
                SELECT 'Web Element Tracker', 'Web elementleri takip et - fiyat, stok, içerik değişimi', '/icons/web-element-tracker.svg', '#6366f1', 'web-element-tracker', '/admin', true, 16, NOW(), NOW()
                WHERE NOT EXISTS (SELECT 1 FROM ""Services"" WHERE ""ContainerName"" = 'web-element-tracker');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UrlPath",
                table: "Services");
        }
    }
}
