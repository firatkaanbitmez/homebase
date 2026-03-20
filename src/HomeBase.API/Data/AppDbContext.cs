using Microsoft.EntityFrameworkCore;
using HomeBase.API.Models;

namespace HomeBase.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Service> Services => Set<Service>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<ContainerState> ContainerStates => Set<ContainerState>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<FirewallRule> FirewallRules => Set<FirewallRule>();
    public DbSet<ServiceCategory> ServiceCategories => Set<ServiceCategory>();
    public DbSet<SettingsHistory> SettingsHistory => Set<SettingsHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Service: ServiceSlug is the new unique identifier (replaces ContainerName unique)
        modelBuilder.Entity<Service>()
            .HasIndex(s => s.ServiceSlug).IsUnique();

        modelBuilder.Entity<Service>()
            .HasOne(s => s.Category)
            .WithMany()
            .HasForeignKey(s => s.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        // Setting: composite unique on (ServiceId, Key) instead of Key alone
        modelBuilder.Entity<Setting>()
            .HasIndex(s => new { s.ServiceId, s.Key }).IsUnique();

        modelBuilder.Entity<Setting>()
            .HasOne(s => s.Service)
            .WithMany()
            .HasForeignKey(s => s.ServiceId)
            .OnDelete(DeleteBehavior.Cascade);

        // ContainerState: ServiceId unique (when not null), ContainerName no longer unique
        modelBuilder.Entity<ContainerState>()
            .HasIndex(c => c.ServiceId).IsUnique()
            .HasFilter("\"ServiceId\" IS NOT NULL");

        modelBuilder.Entity<ContainerState>()
            .HasOne(c => c.Service)
            .WithMany()
            .HasForeignKey(c => c.ServiceId)
            .OnDelete(DeleteBehavior.SetNull);

        // FirewallRule: keep (Port, Protocol) unique, add ServiceId FK
        modelBuilder.Entity<FirewallRule>()
            .HasIndex(f => new { f.Port, f.Protocol }).IsUnique();

        modelBuilder.Entity<FirewallRule>()
            .HasOne(f => f.Service)
            .WithMany()
            .HasForeignKey(f => f.ServiceId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<AuditLog>()
            .HasIndex(a => a.CreatedAt);

        modelBuilder.Entity<AuditLog>()
            .HasIndex(a => a.Action);

        modelBuilder.Entity<SettingsHistory>()
            .HasOne(h => h.Setting)
            .WithMany()
            .HasForeignKey(h => h.SettingId)
            .OnDelete(DeleteBehavior.Cascade);

        // Seed default categories
        modelBuilder.Entity<ServiceCategory>().HasData(
            new ServiceCategory { Id = 1, Name = "Media", Icon = "film", Color = "#e74c3c", SortOrder = 1 },
            new ServiceCategory { Id = 2, Name = "Development", Icon = "code", Color = "#3498db", SortOrder = 2 },
            new ServiceCategory { Id = 3, Name = "Monitoring", Icon = "activity", Color = "#10b981", SortOrder = 3 },
            new ServiceCategory { Id = 4, Name = "Productivity", Icon = "briefcase", Color = "#f59e0b", SortOrder = 4 },
            new ServiceCategory { Id = 5, Name = "Security", Icon = "shield", Color = "#ef4444", SortOrder = 5 },
            new ServiceCategory { Id = 6, Name = "AI/ML", Icon = "cpu", Color = "#8b5cf6", SortOrder = 6 },
            new ServiceCategory { Id = 7, Name = "Storage", Icon = "database", Color = "#06b6d4", SortOrder = 7 },
            new ServiceCategory { Id = 8, Name = "Networking", Icon = "globe", Color = "#f97316", SortOrder = 8 }
        );
    }
}
