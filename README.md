# HomeBase

Self-hosted home server dashboard for managing Docker services, firewall rules, and system monitoring — all from a single web UI.

## Features

- **Service Management** — Deploy, start, stop, and remove Docker containers from the dashboard
- **Service Catalog** — 30+ pre-configured services (Jellyfin, Nextcloud, Grafana, Pi-hole, Ollama, etc.) ready to deploy with one click
- **AI-Powered Onboarding** — Point to a project folder and let AI generate the Docker Compose configuration automatically
- **Firewall Control** — Open/close ports per service with Windows Firewall integration
- **System Monitoring** — Live CPU, RAM, disk, and GPU usage
- **Settings & Environment Variables** — Manage env vars per service with port conflict detection
- **Audit Logging** — Track all changes made through the dashboard

## Quick Start

```bash
git clone https://github.com/firatkaanbitmez/homebase.git
cd homebase
docker compose up -d
```

Open `http://localhost:3000` in your browser.

## Architecture

- **Backend:** ASP.NET Core 8 Web API
- **Frontend:** Vanilla HTML/CSS/JS (served as static files)
- **Database:** PostgreSQL 16
- **Containerization:** Docker + Docker Compose

## Project Structure

```
homebase/
├── Controllers/       # API endpoints
├── Services/          # Business logic (Docker, Firewall, AI, Compose)
├── Data/              # EF Core DbContext, seeder, service catalog
├── Models/            # Entity models and DTOs
├── Migrations/        # EF Core database migrations
├── Middleware/         # Error handling middleware
├── wwwroot/           # Frontend (HTML, CSS, JS, icons)
├── docker-compose.yml # Infrastructure (PostgreSQL + Dashboard)
├── Dockerfile         # Multi-stage build
└── services/          # Per-service compose files (auto-generated)
```

## Requirements

- Docker & Docker Compose
- Windows (for firewall management features — other features work on any OS)

## Configuration

Default settings work out of the box. For customization:

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `3000` | Dashboard web UI port |
| `POSTGRES_PASSWORD` | `pass123` | Database password |

AI features require an OpenAI API key, configurable from the Settings page in the dashboard.

## License

[MIT](LICENSE)
