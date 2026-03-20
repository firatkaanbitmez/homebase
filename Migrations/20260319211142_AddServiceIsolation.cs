using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HomeBase.API.Migrations
{
    /// <inheritdoc />
    public partial class AddServiceIsolation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Settings_Key",
                table: "Settings");

            migrationBuilder.DropIndex(
                name: "IX_Services_ContainerName",
                table: "Services");

            migrationBuilder.DropIndex(
                name: "IX_ContainerStates_ContainerName",
                table: "ContainerStates");

            migrationBuilder.AddColumn<int>(
                name: "ServiceId",
                table: "Settings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ComposeFilePath",
                table: "Services",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceSlug",
                table: "Services",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Data migration: populate ServiceSlug from ComposeName or ContainerName
            migrationBuilder.Sql(
                @"UPDATE ""Services"" SET ""ServiceSlug"" = COALESCE(""ComposeName"", ""ContainerName"") WHERE ""ServiceSlug"" = ''");

            // Handle any remaining duplicates by appending Id
            migrationBuilder.Sql(
                @"UPDATE ""Services"" s SET ""ServiceSlug"" = s.""ServiceSlug"" || '-' || s.""Id""
                  WHERE s.""Id"" NOT IN (
                    SELECT MIN(s2.""Id"") FROM ""Services"" s2 GROUP BY s2.""ServiceSlug""
                  )");

            // Also populate Setting.ServiceId from ServiceComposeName → Service.Id
            migrationBuilder.Sql(
                @"UPDATE ""Settings"" st SET ""ServiceId"" = s.""Id""
                  FROM ""Services"" s
                  WHERE st.""ServiceComposeName"" IS NOT NULL
                    AND (s.""ComposeName"" = st.""ServiceComposeName"" OR s.""ContainerName"" = st.""ServiceComposeName"")
                    AND st.""ServiceId"" IS NULL");

            // Also populate Setting.ServiceId by matching Section name to Service.Name
            migrationBuilder.Sql(
                @"UPDATE ""Settings"" st SET ""ServiceId"" = s.""Id""
                  FROM ""Services"" s
                  WHERE st.""ServiceId"" IS NULL
                    AND s.""Name"" = st.""Section""");

            migrationBuilder.AddColumn<int>(
                name: "ServiceId",
                table: "FirewallRules",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ServiceId",
                table: "ContainerStates",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Settings_ServiceId_Key",
                table: "Settings",
                columns: new[] { "ServiceId", "Key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Services_ServiceSlug",
                table: "Services",
                column: "ServiceSlug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FirewallRules_ServiceId",
                table: "FirewallRules",
                column: "ServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_ContainerStates_ServiceId",
                table: "ContainerStates",
                column: "ServiceId",
                unique: true,
                filter: "\"ServiceId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_ContainerStates_Services_ServiceId",
                table: "ContainerStates",
                column: "ServiceId",
                principalTable: "Services",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_FirewallRules_Services_ServiceId",
                table: "FirewallRules",
                column: "ServiceId",
                principalTable: "Services",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Settings_Services_ServiceId",
                table: "Settings",
                column: "ServiceId",
                principalTable: "Services",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ContainerStates_Services_ServiceId",
                table: "ContainerStates");

            migrationBuilder.DropForeignKey(
                name: "FK_FirewallRules_Services_ServiceId",
                table: "FirewallRules");

            migrationBuilder.DropForeignKey(
                name: "FK_Settings_Services_ServiceId",
                table: "Settings");

            migrationBuilder.DropIndex(
                name: "IX_Settings_ServiceId_Key",
                table: "Settings");

            migrationBuilder.DropIndex(
                name: "IX_Services_ServiceSlug",
                table: "Services");

            migrationBuilder.DropIndex(
                name: "IX_FirewallRules_ServiceId",
                table: "FirewallRules");

            migrationBuilder.DropIndex(
                name: "IX_ContainerStates_ServiceId",
                table: "ContainerStates");

            migrationBuilder.DropColumn(
                name: "ServiceId",
                table: "Settings");

            migrationBuilder.DropColumn(
                name: "ComposeFilePath",
                table: "Services");

            migrationBuilder.DropColumn(
                name: "ServiceSlug",
                table: "Services");

            migrationBuilder.DropColumn(
                name: "ServiceId",
                table: "FirewallRules");

            migrationBuilder.DropColumn(
                name: "ServiceId",
                table: "ContainerStates");

            migrationBuilder.CreateIndex(
                name: "IX_Settings_Key",
                table: "Settings",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Services_ContainerName",
                table: "Services",
                column: "ContainerName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ContainerStates_ContainerName",
                table: "ContainerStates",
                column: "ContainerName",
                unique: true);
        }
    }
}
