<h1 align="center">HomeBase</h1>

<p align="center">
  Self-hosted home server dashboard for managing Docker services from a single web UI.
  <br>
  Deploy, monitor, configure — all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet" alt=".NET 8">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

## Features

**Service Management**
- Deploy, start, stop, restart, and remove containers from the UI
- Real-time status updates via SignalR (WebSocket)
- Grid and list view modes with live CPU/RAM metrics per container

**One-Click Deploy (4 Methods)**
- **Docker Hub Search** — search and deploy any image instantly
- **Recommended Catalog** — 35+ pre-configured services (Jellyfin, Grafana, Pi-hole, Ollama, n8n, etc.)
- **AI Wizard** — point to any project folder, AI generates Dockerfile + Compose config
- **Manual** — full control over image, ports, volumes, and environment

**Smart Deploy Failure Handling**
- Non-AI deploys (Docker Hub, Catalog, Manual) show container logs on failure with Refresh / Restart buttons
- AI deploys get automatic chain-of-thought diagnosis: AI analyzes logs, fixes compose/Dockerfile, and retries
- Optional "Diagnose with AI" button on non-AI failures when AI is configured
- Input validation: empty names, missing images, duplicate ports, port conflicts, and long container names are all caught

**AI-Powered Deployment**
- Automatic deploy diagnosis with multi-attempt fix loop
- Multi-provider support: OpenAI, Gemini, Claude, or custom endpoint
- Deploy chat: interact with AI to fix issues mid-deploy

**Monitoring**
- Live CPU, RAM, disk, network, and GPU usage
- Per-container resource charts with configurable history
- System health dashboard in Settings

**Configuration**
- Per-service environment variables with port conflict detection
- Configurable: AI tokens/attempts, compose timeout, stop timeout, chart history, GPU polling
- Dark/light theme, TR/EN language support

**Port Access Control**
- Toggle ports between public and local-only access
- Reverse proxy for local-only services accessed remotely

**Audit Log**
- Full history of all actions (start, stop, deploy, settings changes)
- Filterable by action, target, and date range

---

## Quick Start

```bash
git clone https://github.com/firatkaanbitmez/homebase.git
cd homebase
docker compose up -d
```

Open **http://localhost:3000**

---

## Architecture

```
Browser ──► ASP.NET Core 8 API ──► Docker Engine (via socket)
                │                         │
                ├── SignalR Hub            ├── Container lifecycle
                ├── Static frontend       ├── Compose file management
                └── EF Core ──► PostgreSQL └── AI service (OpenAI/Gemini/Claude)
```

| Layer | Tech |
|---|---|
| Backend | ASP.NET Core 8, Entity Framework Core |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Database | PostgreSQL 16 (Alpine) |
| Real-time | SignalR WebSocket |
| AI | OpenAI, Google Gemini, Anthropic Claude, Custom |
| Container | Docker Engine API + Docker Compose CLI |

---

## Project Structure

```
homebase/
├── src/HomeBase.API/
│   ├── Controllers/       # REST API endpoints
│   ├── Services/          # Docker, AI, Compose, Firewall, Settings
│   ├── Data/              # DbContext, seeder, migrations
│   ├── Models/            # Entities and DTOs
│   ├── Hubs/              # SignalR real-time hub
│   ├── Middleware/        # Error handling
│   ├── wwwroot/           # Frontend (modular JS, CSS, icons)
│   ├── Dockerfile         # Multi-stage build
│   └── Program.cs         # Entry point
├── services/              # Per-service compose files (auto-generated)
├── docker-compose.yml     # PostgreSQL + Dashboard
└── LICENSE
```

---

## Configuration

Default settings work out of the box. All settings are configurable from the UI (Settings page).

| Setting | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `3000` | Web UI port |
| `POSTGRES_PASSWORD` | `pass123` | Database password |
| AI Provider | — | OpenAI / Gemini / Claude / Custom (set in Settings) |
| AI Max Tokens | `4000` | AI response token limit |
| AI Max Attempts | `3` | Auto-fix retry count |
| Compose Timeout | `120s` | Compose operation timeout |
| Container Stop Timeout | `10s` | Graceful shutdown timeout |
| Chart History | `60` | Dashboard chart data points |
| GPU Poll Interval | `10s` | GPU info refresh rate |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Switch views (Dashboard, Containers, Audit, Settings) |
| `/` | Focus search |
| `n` | Open deploy wizard |
| `r` | Refresh data |
| `t` | Toggle theme |
| `Esc` | Close modals |

---

## License

[MIT](LICENSE)
