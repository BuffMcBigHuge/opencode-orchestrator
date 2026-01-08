# Simple Multi-Project Setup (Without PM2/Docker)

This guide shows the simplest way to run multiple orchestrator instances without installing PM2, systemd, or Docker.

## Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
cd /path/to/opencode-orchestrator
npm install
npm run build
```

### 2. Create Project Configs
```bash
# Create config directories
mkdir -p configs/project-a configs/project-b

# Create .env for project A
cat > configs/project-a/.env << EOF
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=myorg/project-a
GITHUB_USERNAME=myusername
PROJECT_PATH=/absolute/path/to/repos/project-a
MAX_CONCURRENT_TASKS=2
EOF

# Create .env for project B
cat > configs/project-b/.env << EOF
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=myorg/project-b
GITHUB_USERNAME=myusername
PROJECT_PATH=/absolute/path/to/repos/project-b
MAX_CONCURRENT_TASKS=2
EOF
```

### 3. Run Projects

**Option A: Manual (one terminal per project)**
```bash
# Terminal 1
CONFIG_DIR=configs/project-a npm run start:config

# Terminal 2 (new terminal)
CONFIG_DIR=configs/project-b npm run start:config
```

**Option B: Using Helper Script (recommended)**
```bash
# Make script executable
chmod +x manage-orchestrators.sh

# Start all projects in background
./manage-orchestrators.sh start

# Check status
./manage-orchestrators.sh status

# View logs
./manage-orchestrators.sh logs project-a

# Stop all
./manage-orchestrators.sh stop
```

## Helper Script Commands

```bash
# Start all projects
./manage-orchestrators.sh start

# Stop all projects
./manage-orchestrators.sh stop

# Restart all projects
./manage-orchestrators.sh restart

# Check status (shows PID and memory usage)
./manage-orchestrators.sh status

# View logs for specific project (follow mode)
./manage-orchestrators.sh logs project-a

# List all projects
./manage-orchestrators.sh list
```

## Directory Structure

```
opencode-orchestrator/
├── configs/
│   ├── project-a/
│   │   ├── .env
│   │   ├── orchestrator.pid      # Created automatically
│   │   └── logs/
│   │       └── output.log        # Auto-generated logs
│   ├── project-b/
│   │   ├── .env
│   │   ├── orchestrator.pid
│   │   └── logs/
│   │       └── output.log
│   └── project-c/
│       ├── .env
│       ├── orchestrator.pid
│       └── logs/
│           └── output.log
├── dist/                          # Built code
├── manage-orchestrators.sh        # Helper script
└── package.json
```

## npm Script Commands

The following commands are available in package.json:

### Development Mode (with hot reload)
```bash
# Default (uses .env in root)
npm run dev

# Custom config directory
CONFIG_DIR=configs/project-a npm run dev:config
```

### Production Mode
```bash
# Default (uses .env in root)
npm run build
npm start

# Custom config directory
npm run build
CONFIG_DIR=configs/project-a npm run start:config
```

## Manual Background Execution

If you don't want to use the helper script, you can manually run in background:

### Using nohup
```bash
# Start project A in background
nohup bash -c "CONFIG_DIR=configs/project-a npm run start:config" \
  > configs/project-a/logs/output.log 2>&1 &
echo $! > configs/project-a/orchestrator.pid

# View logs
tail -f configs/project-a/logs/output.log

# Stop (using PID file)
kill $(cat configs/project-a/orchestrator.pid)
rm configs/project-a/orchestrator.pid
```

### Using tmux
```bash
# Start project A in tmux session
tmux new-session -d -s orch-project-a \
  "CONFIG_DIR=configs/project-a npm run start:config"

# List sessions
tmux list-sessions

# Attach to session (view logs)
tmux attach-session -t orch-project-a

# Detach from session: Ctrl+B, then D

# Stop session
tmux kill-session -t orch-project-a
```

### Using screen
```bash
# Start project A in screen session
screen -dmS orch-project-a bash -c \
  "CONFIG_DIR=configs/project-a npm run start:config"

# List sessions
screen -ls

# Attach to session
screen -r orch-project-a

# Detach: Ctrl+A, then D

# Stop session
screen -S orch-project-a -X quit
```

## Viewing Logs

### Helper Script
```bash
# Follow logs (Ctrl+C to exit)
./manage-orchestrators.sh logs project-a
```

### Manual
```bash
# Follow logs in real-time
tail -f configs/project-a/logs/output.log

# View last 100 lines
tail -n 100 configs/project-a/logs/output.log

# View last 100 lines from all projects
tail -n 100 configs/*/logs/output.log

# Search logs for errors
grep -i error configs/project-a/logs/output.log

# View logs with timestamps
tail -f configs/project-a/logs/output.log | ts '[%Y-%m-%d %H:%M:%S]'
```

## Checking Status

### Helper Script
```bash
./manage-orchestrators.sh status
```

Output example:
```
ℹ Orchestrator Status:

✓ project-a (PID: 12345, Memory: 245MB) - Running
✓ project-b (PID: 12346, Memory: 198MB) - Running
⚠ project-c - Stopped
```

### Manual
```bash
# Check if process is running
for dir in configs/*/; do
    project=$(basename "$dir")
    if [ -f "$dir/orchestrator.pid" ]; then
        pid=$(cat "$dir/orchestrator.pid")
        if ps -p $pid > /dev/null 2>&1; then
            echo "✓ $project (PID: $pid) - Running"
        else
            echo "✗ $project - Stopped"
        fi
    else
        echo "✗ $project - Not started"
    fi
done
```

## Adding New Project

```bash
# 1. Create config directory
mkdir -p configs/new-project/logs

# 2. Create .env file
cat > configs/new-project/.env << EOF
GITHUB_TOKEN=ghp_xxx
GITHUB_REPO=myorg/new-project
GITHUB_USERNAME=myusername
PROJECT_PATH=/path/to/repos/new-project
MAX_CONCURRENT_TASKS=2
EOF

# 3. Start it
./manage-orchestrators.sh start
# Or manually:
CONFIG_DIR=configs/new-project npm run start:config
```

## Troubleshooting

### Project Won't Start
```bash
# Check if .env exists
ls -la configs/project-a/.env

# Check if .env is valid
cat configs/project-a/.env

# Try running in foreground to see errors
CONFIG_DIR=configs/project-a npm run dev:config
```

### Port Already in Use
```bash
# Check if orchestrator is already running
ps aux | grep "npm run start:config"

# Stop duplicate processes
./manage-orchestrators.sh stop
```

### View Detailed Errors
```bash
# Run in development mode (more verbose)
CONFIG_DIR=configs/project-a npm run dev:config

# Or check log file
tail -n 50 configs/project-a/logs/output.log
```

### Clean Up Stale PID Files
```bash
# Remove all PID files
rm configs/*/orchestrator.pid

# Or use status command (auto-removes stale PIDs)
./manage-orchestrators.sh status
```

## Comparison with Other Methods

| Feature | Helper Script | PM2 | systemd | Docker |
|---------|--------------|-----|---------|--------|
| **Setup Complexity** | ⭐ Very Simple | ⭐⭐ Simple | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Complex |
| **Dependencies** | None (bash only) | npm install pm2 | Linux + sudo | Docker |
| **Auto-restart** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Log Management** | Basic (files) | Advanced | systemd journal | Docker logs |
| **Monitoring** | Manual | Built-in | systemctl | docker stats |
| **Startup on Boot** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Resource Limits** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Best For** | Dev/Testing | Dev/Small Prod | Production | Cloud/Containers |

## When to Use This Method

**Use the helper script when:**
- ✅ You want the simplest possible setup
- ✅ You're testing or developing
- ✅ You don't need auto-restart on crashes
- ✅ You manage servers manually
- ✅ You want to avoid additional dependencies

**Upgrade to PM2/systemd/Docker when:**
- ❌ You need automatic restart on crashes
- ❌ You need startup on system boot
- ❌ You want advanced monitoring/metrics
- ❌ You need resource limits (CPU/memory)
- ❌ You're running in production

## Migration Path

When you're ready to upgrade from the helper script:

### To PM2:
```bash
# Install PM2
npm install -g pm2

# Copy ecosystem config
cp docs/ecosystem.config.example.js configs/ecosystem.config.js

# Edit and start
pm2 start configs/ecosystem.config.js
pm2 save
pm2 startup
```

### To systemd:
```bash
# Copy service file for each project
sudo cp docs/orchestrator.service.example \
     /etc/systemd/system/orchestrator-project-a.service

# Edit, enable, and start
sudo systemctl enable orchestrator-project-a
sudo systemctl start orchestrator-project-a
```

### To Docker:
```bash
# Copy Docker files
cp docs/Dockerfile.example Dockerfile
cp docs/docker-compose.example.yml docker-compose.yml

# Build and start
docker-compose up -d
```

## Summary

The helper script provides a **zero-dependency solution** for running multiple orchestrator instances. It's perfect for development, testing, and simple production deployments where you don't need advanced process management features.

**Quick commands to remember:**
```bash
./manage-orchestrators.sh start    # Start all
./manage-orchestrators.sh status   # Check status
./manage-orchestrators.sh logs <project>  # View logs
./manage-orchestrators.sh stop     # Stop all
```
