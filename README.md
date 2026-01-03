# OpenCode GitHub Task Orchestrator

> **Autonomous AI-driven development system** that monitors GitHub issues, executes development tasks using OpenCode + oh-my-opencode (Sisyphus), and delivers completed work as Pull Requests.

## Overview

This system enables **fully autonomous AI-driven development** where:

1. **Users create GitHub issues** describing tasks, features, or bugs
2. **This cron service polls GitHub** for new tasks (issues with `ai-task` label)
3. **OpenCode + Sisyphus** executes the work in isolated git worktrees
4. **Ralph Loop** enables iterative, self-correcting implementation
5. **Quality gates** ensure code meets standards before PR creation
6. **Completed work is submitted as Pull Requests** with full documentation
7. **Users review and merge PRs** from anywhere (including mobile)

## Features

- ✅ **GitHub as Database**: All state stored via GitHub labels and comments
- ✅ **Parallel Execution**: Multiple tasks via git worktrees
- ✅ **Priority Ordering**: High > Medium > Low priority task handling
- ✅ **Ralph Loop Integration**: Autonomous iterative development
- ✅ **Quality Gates**: Linting, type-checking, build verification
- ✅ **CI/CD Integration**: Wait for CI success before PR creation
- ✅ **Checkpoint System**: Long-running task state persistence
- ✅ **Blocking/Continuation**: Human-in-the-loop for clarifications
- ✅ **Session Sharing**: Full transparency with OpenCode session links

## Prerequisites

1. **Node.js 20+** installed
2. **OpenCode** installed and configured ([opencode.dev](https://opencode.dev))
3. **oh-my-opencode** plugin installed ([GitHub](https://github.com/code-yeongyu/oh-my-opencode))
4. **GitHub Personal Access Token** with required permissions

> **Note:** API keys and models are managed by OpenCode and oh-my-opencode, not this orchestrator. Configure your LLM providers (Anthropic, OpenAI, Google) through OpenCode's configuration files.

## Setup

### 1. Clone and Install

```bash
# From your project root, create the orchestrator directory
cd /path/to/your/project
mkdir -p opencode-orchestrator
cd opencode-orchestrator

# Copy files or clone this project
# Then install dependencies
npm install
```

### 2. Configure Environment

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Required: GitHub Configuration
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=your-username/your-repo
GITHUB_USERNAME=your-username

# Required: Project path (absolute path to your repo)
PROJECT_PATH=/path/to/your/project

# Optional: Adjust defaults as needed
POLL_INTERVAL_MS=300000
MAX_CONCURRENT_TASKS=2
```

> **Note:** API keys for Anthropic, OpenAI, and Google are configured in OpenCode itself, not here. See step 4 below.

### 3. Create GitHub Labels

Create these labels in your repository:

| Label | Color | Description |
|-------|-------|-------------|
| `ai-task` | `#0e8a16` (Green) | Ready for AI pickup |
| `ai-in-progress` | `#fbca04` (Yellow) | Currently being worked on |
| `ai-blocked` | `#7057ff` (Purple) | Waiting for human clarification |
| `ai-review-ready` | `#1d76db` (Blue) | PR created, awaiting review |
| `ai-priority:high` | `#b60205` (Red) | High priority |
| `ai-priority:medium` | `#fbca04` (Yellow) | Medium priority |
| `ai-priority:low` | `#0052cc` (Blue) | Low priority |

### 4. Configure OpenCode (API Keys & Models)

OpenCode and oh-my-opencode manage all LLM API keys and model selection. The orchestrator uses OpenCode as-is with its default configuration.

**Set up API keys in OpenCode:**
```bash
# Configure via environment or OpenCode's built-in setup
export ANTHROPIC_API_KEY=sk-ant-xxxx  # Required for Sisyphus
export OPENAI_API_KEY=sk-xxxx         # Required for Oracle
export GOOGLE_API_KEY=AIza-xxxx       # Optional for Gemini
```

**~/.config/opencode/opencode.json:**
```json
{
  "plugin": ["oh-my-opencode"]
}
```

**~/.config/opencode/oh-my-opencode.json:**
```json
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  "sisyphus_agent": {
    "disabled": false
  },
  "agents": {
    "Sisyphus": {
      "model": "anthropic/claude-opus-4-5"
    },
    "oracle": {
      "model": "openai/gpt-5.2"
    },
    "librarian": {
      "model": "anthropic/claude-sonnet-4-5"
    }
  }
}
```

> **Important:** The orchestrator does not require or manage API keys. All LLM configuration is handled by OpenCode and oh-my-opencode.

### 5. Create GitHub Personal Access Token

Go to [GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta)

Create a token with these **repository permissions**:
- **Contents**: Read and write
- **Issues**: Read and write
- **Pull requests**: Read and write
- **Checks**: Read (for CI status)
- **Metadata**: Read (required)

### 6. Build and Start

```bash
# Build
npm run build

# Start (production)
npm start

# Or run in development mode with hot reload
npm run dev
```

## Usage

### Creating Tasks

1. **Create a GitHub Issue** in your repository
2. **Add the `ai-task` label** to mark it for AI pickup
3. **Optionally add a priority label** (`ai-priority:high`, `ai-priority:medium`, `ai-priority:low`)
4. **Wait for the orchestrator** to pick it up on the next poll

### Example Issue

**Title:** Add user authentication with JWT

**Body:**
```markdown
## Description
Implement JWT-based authentication for the API.

## Requirements
- [ ] Create login endpoint accepting email/password
- [ ] Generate JWT tokens with 24h expiry
- [ ] Create middleware to verify tokens
- [ ] Add protected route example
- [ ] Write tests for all endpoints

## Technical Notes
- Use existing User model in `src/models/user.ts`
- Follow existing API patterns in `src/routes/`
```

### Workflow

1. **Issue Created** → User adds `ai-task` label
2. **Orchestrator Picks Up** → Removes `ai-task`, adds `ai-in-progress`
3. **Agent Works** → Posts progress updates, uses Ralph Loop for implementation
4. **Quality Gates** → Runs linting, type-checking, tests
5. **PR Created** → Removes `ai-in-progress`, adds `ai-review-ready`
6. **Human Reviews** → Merge or request changes

### Handling Clarifications

If the agent needs clarification:
1. It adds `ai-blocked` label
2. Posts a comment with specific questions
3. **You reply** to the comment
4. Next poll cycle, agent continues work

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | - | GitHub PAT (required) |
| `GITHUB_REPO` | - | Repository in owner/repo format (required) |
| `GITHUB_USERNAME` | - | Your GitHub username (required) |
| `PROJECT_PATH` | - | Absolute path to repository (required) |
| `POLL_INTERVAL_MS` | `300000` | Poll interval in milliseconds (5 min) |
| `MAX_CONCURRENT_TASKS` | `2` | Max parallel tasks |
| `WORKTREE_DIR` | `.worktrees` | Dir for git worktrees |
| `RALPH_LOOP_ENABLED` | `true` | Enable Ralph Loop |
| `RALPH_LOOP_MAX_ITERATIONS` | `100` | Max Ralph Loop iterations |
| `ENFORCE_QUALITY_GATES` | `true` | Require quality gates |
| `REQUIRE_CI_PASS` | `true` | Wait for CI before PR |
| `CI_WAIT_TIMEOUT_MINUTES` | `10` | CI wait timeout |
| `CHECKPOINT_INTERVAL_MINUTES` | `30` | Checkpoint frequency |
| `WORKTREE_RETENTION_DAYS` | `7` | Keep worktrees X days |

## Project Structure

```
opencode-orchestrator/
├── src/
│   ├── index.ts              # Entry point, cron scheduler
│   ├── config.ts             # Configuration loading
│   ├── github/
│   │   ├── client.ts         # GitHub API wrapper
│   │   ├── labels.ts         # Label definitions
│   │   └── comments.ts       # Comment templates
│   ├── tasks/
│   │   ├── manager.ts        # Task lifecycle
│   │   ├── worktree.ts       # Git worktree ops
│   │   ├── opencode.ts       # OpenCode process management
│   │   └── quality.ts        # Quality gate runner
│   ├── prompts/
│   │   └── orchestrator.ts   # Prompt templates
│   └── utils/
│       ├── logger.ts         # Logging
│       └── slug.ts           # Slug utilities
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Common Issues

**1. "GITHUB_TOKEN is required"**
- Ensure `.env` file exists and contains valid token
- Check token has correct permissions

**2. "Failed to create worktree"**
- Ensure `PROJECT_PATH` is correct and points to a git repository
- Check write permissions in project directory

**3. "OpenCode process exited immediately"**
- Verify OpenCode is installed: `opencode --version`
- Check API keys are configured
- Review OpenCode logs

**4. "Quality gates failing"**
- Ensure project has lint/build scripts in package.json
- Check project builds successfully manually first

### Logs

View logs in development:
```bash
npm run dev
```

Logs are output with timestamps and severity levels via pino.

## License

MIT

---

**Full Documentation:** See [TECHNICAL_SPECIFICATION_V2.md](../docs/TECHNICAL_SPECIFICATION_V2.md) for complete system design.
