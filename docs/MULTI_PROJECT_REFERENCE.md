# Multi-Project Quick Reference Guide

This guide provides quick commands and examples for managing multiple orchestrator instances.

## Directory Structure

Recommended structure for multi-project setup:

```
~/orchestrator/
├── opencode-orchestrator/          # Built orchestrator (shared)
│   ├── dist/
│   │   └── index.js
│   ├── package.json
│   └── node_modules/
│
└── configs/                        # Project configurations
    ├── ecosystem.config.js         # PM2 config (if using PM2)
    │
    ├── project-website/
    │   ├── .env                   # GITHUB_REPO=org/website
    │   └── logs/
    │
    ├── project-mobile-app/
    │   ├── .env                   # GITHUB_REPO=org/mobile-app
    │   └── logs/
    │
    └── project-backend-api/
        ├── .env                   # GITHUB_REPO=org/backend-api
        └── logs/

# Actual project repositories (can be anywhere)
~/repos/
├── website/                       # Git repo
├── mobile-app/                    # Git repo
└── backend-api/                   # Git repo
```

## PM2 Commands

### Starting & Stopping
```bash
# Start all projects
pm2 start ecosystem.config.js

# Start specific project
pm2 start ecosystem.config.js --only orchestrator-website

# Stop all
pm2 stop all

# Stop specific
pm2 stop orchestrator-website

# Restart all
pm2 restart all

# Restart specific
pm2 restart orchestrator-website

# Delete all (stop and remove from PM2)
pm2 delete all
```

### Monitoring & Logs
```bash
# View status of all orchestrators
pm2 status

# Real-time monitoring dashboard
pm2 monit

# View all logs (follow)
pm2 logs

# View specific project logs
pm2 logs orchestrator-website

# View last 100 lines
pm2 logs orchestrator-website --lines 100

# View only errors
pm2 logs orchestrator-website --err

# Flush logs
pm2 flush

# Show detailed info
pm2 show orchestrator-website
```

### Process Management
```bash
# Save current process list (for startup)
pm2 save

# Resurrect saved processes
pm2 resurrect

# Setup startup script (run on system boot)
pm2 startup

# Disable startup
pm2 unstartup

# Update PM2
pm2 update

# Reset restart count
pm2 reset orchestrator-website
```

### Adding New Project
```bash
# 1. Create config directory
mkdir ~/orchestrator/configs/new-project

# 2. Create .env file
cat > ~/orchestrator/configs/new-project/.env << EOF
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=org/new-project
GITHUB_USERNAME=myusername
PROJECT_PATH=/home/user/repos/new-project
MAX_CONCURRENT_TASKS=2
EOF

# 3. Add to ecosystem.config.js
# (edit file and add new app config)

# 4. Start new project
pm2 start ecosystem.config.js --only orchestrator-new-project

# 5. Save configuration
pm2 save
```

## systemd Commands

### Service Management
```bash
# Start service
sudo systemctl start orchestrator-website

# Stop service
sudo systemctl stop orchestrator-website

# Restart service
sudo systemctl restart orchestrator-website

# Reload (reload config without restart)
sudo systemctl reload orchestrator-website

# Enable (start on boot)
sudo systemctl enable orchestrator-website

# Disable (don't start on boot)
sudo systemctl disable orchestrator-website

# Check if enabled
sudo systemctl is-enabled orchestrator-website
```

### Status & Logs
```bash
# View status
sudo systemctl status orchestrator-website

# View status of all orchestrators
systemctl status 'orchestrator-*'

# View logs (follow)
sudo journalctl -u orchestrator-website -f

# View logs from all orchestrators
sudo journalctl -u 'orchestrator-*' -f

# View logs since boot
sudo journalctl -u orchestrator-website -b

# View logs from last hour
sudo journalctl -u orchestrator-website --since "1 hour ago"

# View last 100 lines
sudo journalctl -u orchestrator-website -n 100

# View only errors
sudo journalctl -u orchestrator-website -p err

# Export logs to file
sudo journalctl -u orchestrator-website > ~/logs.txt
```

### Batch Operations
```bash
# Start all orchestrator services
sudo systemctl start orchestrator-*

# Stop all
sudo systemctl stop orchestrator-*

# Restart all
sudo systemctl restart orchestrator-*

# Check status of all
systemctl list-units 'orchestrator-*'

# Enable all on boot
sudo systemctl enable orchestrator-*
```

### Adding New Project
```bash
# 1. Create config directory
mkdir -p ~/orchestrator/configs/new-project/logs

# 2. Create .env file
cat > ~/orchestrator/configs/new-project/.env << EOF
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=org/new-project
GITHUB_USERNAME=myusername
PROJECT_PATH=/home/user/repos/new-project
EOF

# 3. Copy and edit service file
sudo cp /etc/systemd/system/orchestrator-website.service \
        /etc/systemd/system/orchestrator-new-project.service
sudo nano /etc/systemd/system/orchestrator-new-project.service
# Update WorkingDirectory, EnvironmentFile, SyslogIdentifier

# 4. Reload systemd
sudo systemctl daemon-reload

# 5. Start and enable
sudo systemctl enable --now orchestrator-new-project

# 6. Check status
sudo systemctl status orchestrator-new-project
```

## Docker Compose Commands

### Container Management
```bash
# Start all containers
docker-compose up -d

# Start specific container
docker-compose up -d orchestrator-website

# Stop all
docker-compose down

# Stop without removing containers
docker-compose stop

# Start stopped containers
docker-compose start

# Restart all
docker-compose restart

# Restart specific
docker-compose restart orchestrator-website

# Remove stopped containers
docker-compose rm
```

### Logs & Monitoring
```bash
# View all logs (follow)
docker-compose logs -f

# View specific service logs
docker-compose logs -f orchestrator-website

# View last 100 lines
docker-compose logs --tail=100 orchestrator-website

# View logs without following
docker-compose logs orchestrator-website

# View container status
docker-compose ps

# View resource usage
docker stats
```

### Build & Update
```bash
# Rebuild and restart
docker-compose up -d --build

# Force recreate containers
docker-compose up -d --force-recreate

# Pull latest base images
docker-compose pull

# Remove unused images
docker image prune
```

### Execute Commands
```bash
# Execute command in container
docker-compose exec orchestrator-website sh

# View environment variables
docker-compose exec orchestrator-website env

# Check logs directory
docker-compose exec orchestrator-website ls -la /app/logs

# View running processes
docker-compose exec orchestrator-website ps aux
```

### Adding New Project
```bash
# 1. Create config directory
mkdir -p configs/new-project/logs

# 2. Create .env file
cat > configs/new-project/.env << EOF
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=org/new-project
GITHUB_USERNAME=myusername
PROJECT_PATH=/workspace
EOF

# 3. Add service to docker-compose.yml
cat >> docker-compose.yml << EOF

  orchestrator-new-project:
    build: .
    container_name: orchestrator-new-project
    restart: unless-stopped
    env_file:
      - ./configs/new-project/.env
    volumes:
      - /home/user/repos/new-project:/workspace
      - ./configs/new-project/logs:/app/logs
    mem_limit: 1g
    cpus: 0.5
EOF

# 4. Start new service
docker-compose up -d orchestrator-new-project
```

## Troubleshooting Commands

### Check Configuration
```bash
# Verify .env file
cat ~/orchestrator/configs/project-website/.env

# Check if project repo is accessible
ls -la /home/user/repos/website

# Check git repo status
cd /home/user/repos/website && git status

# Test GitHub connection
curl -H "Authorization: token ghp_xxx" https://api.github.com/user
```

### Resource Usage
```bash
# PM2 - view memory usage
pm2 list

# systemd - view memory/CPU limits
systemctl show orchestrator-website | grep -E 'Memory|CPU'

# Docker - resource usage
docker stats orchestrator-website

# System-wide
top
htop
```

### Debug Mode
```bash
# PM2 - restart with debug logs
pm2 restart orchestrator-website --update-env
pm2 env orchestrator-website

# systemd - increase log verbosity
# Edit .env and add: LOG_LEVEL=debug
sudo systemctl restart orchestrator-website
sudo journalctl -u orchestrator-website -f

# Docker - view container details
docker inspect orchestrator-website
```

## Common Workflows

### Morning Check
```bash
# Check all orchestrators are running
pm2 status
# or
systemctl status 'orchestrator-*'
# or
docker-compose ps

# Check for errors in last hour
pm2 logs --lines 50 --err
# or
sudo journalctl -u 'orchestrator-*' --since "1 hour ago" -p err
# or
docker-compose logs --tail=50 | grep -i error
```

### Deploy New Code
```bash
# 1. Build new version
cd ~/orchestrator/opencode-orchestrator
git pull
npm run build

# 2. Restart all orchestrators
pm2 restart all
# or
sudo systemctl restart orchestrator-*
# or
docker-compose restart

# 3. Verify
pm2 logs --lines 20
```

### Add Priority to Issue
```bash
# No orchestrator commands needed - just add GitHub label:
# - ai-priority:high
# - ai-priority:medium  
# - ai-priority:low
# Next poll cycle will pick it up in priority order
```

### Emergency Stop All
```bash
# PM2
pm2 stop all

# systemd
sudo systemctl stop orchestrator-*

# Docker
docker-compose down
```

## Reference Links

- PM2 Documentation: https://pm2.keymetrics.io/docs/usage/quick-start/
- systemd Documentation: https://www.freedesktop.org/software/systemd/man/systemd.service.html
- Docker Compose Documentation: https://docs.docker.com/compose/
- Main README: [../README.md](../README.md)
- Configuration Examples: [ENV_EXAMPLE.md](ENV_EXAMPLE.md)
