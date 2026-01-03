# OpenCode GitHub Task Orchestrator

## Technical Specification v2.0

**Project:** Autonomous AI Development System  
**Author:** AI-Assisted Design  
**Date:** January 2, 2026  
**Status:** Draft - Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture](#architecture)
4. [Components](#components)
5. [GitHub State Machine](#github-state-machine)
6. [Workflow Lifecycle](#workflow-lifecycle)
7. [Testing Strategy](#testing-strategy)
8. [Quality Gates](#quality-gates)
9. [CI/CD Integration](#cicd-integration)
10. [Configuration](#configuration)
11. [Prompt Engineering](#prompt-engineering)
12. [Error Handling & Rollback](#error-handling--rollback)
13. [Security Considerations](#security-considerations)
14. [Future Enhancements](#future-enhancements)
15. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

This system enables **fully autonomous AI-driven development** where:

1. **Users create GitHub issues** describing tasks, features, or bugs
2. **A local cron service** polls GitHub for new tasks
3. **OpenCode + oh-my-opencode (Sisyphus)** executes the work in isolated git worktrees
4. **Ralph Loop** enables iterative, self-correcting implementation until completion
5. **Quality gates** ensure code meets standards before PR creation
6. **Completed work is submitted as Pull Requests** with full documentation
7. **Users review and merge PRs** from anywhere (including mobile)

The system is **stateless by design** - GitHub serves as the database, storing all task state via labels, all communication via comments, and all deliverables as PRs.

### What's New in v2.0

| Enhancement | Description |
|-------------|-------------|
| **Ralph Loop Integration** | Autonomous iterative development until task completion |
| **Quality Gates** | Mandatory linting, type-checking, build verification |
| **Playwright E2E Testing** | Automated browser testing for web features |
| **CI/CD Integration** | Wait for CI success before PR creation |
| **Multi-Cycle State Management** | Checkpoint-based continuation for long-running tasks |
| **Enhanced Documentation** | Automated doc generation and updates |
| **Rollback & Debugging** | Worktree preservation and recovery strategies |

---

## System Overview

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Stateless Executor** | Cron service has no persistent state; GitHub labels are the source of truth |
| **Full Transparency** | Every action logged via comments + OpenCode session sharing |
| **Human-in-the-Loop** | PRs always require human review; agents ask questions when uncertain |
| **Parallel Execution** | Multiple tasks via git worktrees, controlled concurrency |
| **Mobile-First UX** | GitHub notifications keep users informed anywhere |
| **Quality-First** | All code must pass quality gates before PR creation |
| **Iterative Improvement** | Ralph Loop enables self-correcting implementation |

### Key Technologies

| Component | Technology |
|-----------|------------|
| Task Queue | GitHub Issues + Labels |
| State Management | GitHub Labels + Checkpoint Comments |
| Communication | GitHub Comments |
| Deliverables | GitHub Pull Requests |
| Orchestration | OpenCode + oh-my-opencode (Sisyphus) |
| Iterative Execution | Ralph Loop |
| E2E Testing | Playwright MCP |
| GitHub Integration | GitHub MCP + Personal Access Token |
| Scheduler | Node.js + node-cron |
| Isolation | Git Worktrees |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GitHub (Cloud)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │   Issues    │  │   Labels    │  │    PRs      │  │    CI     │  │
│  │  (Tasks)    │  │   (State)   │  │ (Delivery)  │  │ (Quality) │  │
│  └──────┬──────┘  └──────┬──────┘  └──────▲──────┘  └─────▲─────┘  │
│         │                │                │               │         │
│         └────────────────┼────────────────┴───────────────┘         │
│                          │                                           │
│                    GitHub API                                        │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
                           │ HTTPS (PAT Auth)
                           │
┌──────────────────────────┼───────────────────────────────────────────┐
│                    Local Machine                                      │
│                          │                                           │
│  ┌───────────────────────▼───────────────────────┐                   │
│  │              Node-Cron Service                 │                   │
│  │  - Polls GitHub for ai-task issues            │                   │
│  │  - Manages concurrency (MAX_CONCURRENT_TASKS) │                   │
│  │  - Spawns OpenCode orchestrators              │                   │
│  │  - Monitors task completion & checkpoints     │                   │
│  │  - Resumes multi-cycle tasks                  │                   │
│  └───────────────────────┬───────────────────────┘                   │
│                          │                                           │
│            ┌─────────────┼─────────────┐                             │
│            │             │             │                             │
│            ▼             ▼             ▼                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                    │
│  │ OpenCode    │ │ OpenCode    │ │ OpenCode    │                    │
│  │ Instance 1  │ │ Instance 2  │ │ Instance 3  │                    │
│  │             │ │             │ │             │                    │
│  │ Sisyphus +  │ │ Sisyphus +  │ │ Sisyphus +  │                    │
│  │ Ralph Loop  │ │ Ralph Loop  │ │ Ralph Loop  │                    │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                    │
│         │               │               │                            │
│         ▼               ▼               ▼                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                    │
│  │  Worktree   │ │  Worktree   │ │  Worktree   │                    │
│  │  Issue #42  │ │  Issue #43  │ │  Issue #44  │                    │
│  │             │ │             │ │             │                    │
│  │ ai/issue-42 │ │ ai/issue-43 │ │ ai/issue-44 │                    │
│  └─────────────┘ └─────────────┘ └─────────────┘                    │
│                                                                      │
│                    Project Repository                                │
│  ┌─────────────────────────────────────────────┐                    │
│  │  main (primary)                              │                    │
│  │  └── .git/worktrees/                         │                    │
│  │       ├── issue-42/                          │                    │
│  │       ├── issue-43/                          │                    │
│  │       └── issue-44/                          │                    │
│  └─────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Node-Cron Service

The central scheduler that polls GitHub and manages OpenCode instances.

**Responsibilities:**
- Poll GitHub for issues with `ai-task` label
- Respect `MAX_CONCURRENT_TASKS` limit
- Priority ordering (high > medium > low > none)
- Spawn OpenCode processes with appropriate prompts
- Monitor for completion or blocking
- Resume multi-cycle tasks from checkpoints
- Track Ralph Loop execution state
- Handle graceful shutdown

**File:** `src/index.ts`

```typescript
interface CronService {
  config: Config;
  activeTasks: Map<number, TaskContext>;
  ralphLoops: Map<number, RalphLoopContext>;
  
  // Core methods
  pollGitHub(): Promise<Issue[]>;
  canStartNewTask(): boolean;
  startTask(issue: Issue): Promise<void>;
  checkBlockedTasks(): Promise<void>;
  resumeFromCheckpoint(issue: Issue): Promise<void>;
  monitorRalphLoops(): Promise<void>;
}

interface TaskContext {
  issueNumber: number;
  worktreePath: string;
  opencodePid: number;
  startedAt: Date;
  sessionId: string;
  phase: 'analysis' | 'implementation' | 'testing' | 'quality' | 'documentation' | 'pr';
}

interface RalphLoopContext {
  issueNumber: number;
  sessionId: string;
  iterations: number;
  status: 'running' | 'completed' | 'failed';
  lastUpdate: Date;
}
```

### 2. OpenCode + oh-my-opencode (Sisyphus)

The AI orchestration layer that performs actual development work.

**Capabilities via oh-my-opencode:**
- **Sisyphus**: Primary orchestrator (Claude Opus 4.5)
- **Oracle**: Architecture and debugging advisor (GPT 5.2)
- **Librarian**: Documentation and OSS research (Claude Sonnet 4.5)
- **Explore**: Fast codebase navigation (Grok/Gemini)
- **Frontend UI/UX Engineer**: Visual development (Gemini 3 Pro)
- **Background Agents**: Parallel async execution
- **Todo Continuation**: Forces task completion
- **Ralph Loop**: Autonomous execution until done
- **Playwright**: Browser automation for E2E testing

**Invocation:**
```bash
opencode run --prompt "$ORCHESTRATOR_PROMPT" --model anthropic/claude-opus-4-5
```

### 3. Ralph Loop Integration

Ralph Loop enables autonomous, iterative development until task completion.

**Capabilities:**
- Detects `<promise>DONE</promise>` signal for completion
- Auto-continues if agent stops prematurely
- Ends when complete or max iterations (default 100)
- Configurable max iterations

**Usage Patterns:**

```bash
# Multi-iteration implementation
/ralph-loop "Implement this feature end-to-end. Test thoroughly. Don't stop until <promise>DONE</promise>."

# Quality gate enforcement
/ralph-loop "Fix lint/type/build errors. Re-run until all gates pass."

# Test execution and fixing
/ralph-loop "Run full test suite. Fix all failures. End with <promise>DONE</promise> when all pass."
```

**State Tracking:**

```typescript
async function monitorRalphLoops(): Promise<void> {
  for (const [issueNumber, context] of this.ralphLoops) {
    const elapsed = Date.now() - context.lastUpdate.getTime();
    
    // If running >1 hour with no update, investigate
    if (elapsed > 3600000 && context.status === 'running') {
      logger.warn(`Ralph Loop for issue #${issueNumber} may be stuck`);
      // Post status comment or take other action
    }
  }
}
```

### 4. Playwright E2E Testing

Browser automation for comprehensive end-to-end testing.

**Test Coverage Requirements:**
- User flows: Login, create, update, delete
- Edge cases: Empty states, errors, invalid inputs
- Visual regression: Screenshots of key states

**Test File Location:** `tests/e2e/feature-name.spec.ts`
**Run Command:** `bunx playwright test`

### 5. GitHub MCP Integration

All GitHub operations performed via GitHub MCP (Model Context Protocol).

**Operations:**
- Read issue details and comments
- Add/remove labels
- Post comments (progress updates, questions, completion)
- Create branches
- Create pull requests
- Request reviews
- Check CI status

**Authentication:** Personal Access Token via environment variable.

### 6. Git Worktrees

Isolated working directories for parallel task execution.

**Structure:**
```
/path/to/project/                    # Main repo
├── .git/
├── src/
├── package.json
└── ...

/path/to/project/.worktrees/         # Worktree root
├── issue-42/                        # Branch: ai/issue-42-fix-auth
│   ├── src/
│   └── ...
├── issue-43/                        # Branch: ai/issue-43-add-feature
│   ├── src/
│   └── ...
└── issue-44/                        # Branch: ai/issue-44-refactor
    ├── src/
    └── ...
```

**Worktree Retention Policy:**
- Blocked tasks: Keep worktree for continuation
- Failed tasks: Keep worktree for debugging (minimum 7 days)
- Completed tasks: Keep for reference (configurable retention)

---

## GitHub State Machine

### Labels

| Label | Color | Description |
|-------|-------|-------------|
| `ai-task` | 🟢 Green | Ready for AI pickup |
| `ai-priority:high` | 🔴 Red | High priority |
| `ai-priority:medium` | 🟡 Yellow | Medium priority |
| `ai-priority:low` | 🔵 Blue | Low priority (default) |
| `ai-in-progress` | 🟠 Orange | Currently being worked on |
| `ai-blocked` | 🟣 Purple | Waiting for human clarification |
| `ai-review-ready` | 🩵 Cyan | PR created, awaiting review |
| `ai-debugging` | 🔶 Amber | Task failed, needs manual debugging |

### State Transitions

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────────┐    ┌───────────┐    ┌─────────────────┐     │
│  (new)   │───▶│  ai-task  │───▶│  ai-in-progress │     │
│  issue   │    │           │    │                 │     │
└──────────┘    └───────────┘    └────────┬────────┘     │
     │               ▲                    │              │
     │               │                    ▼              │
     │               │           ┌────────────────┐      │
     │               │           │  ai-blocked    │──────┘
     │               │           │  (needs input) │  (human replies)
     │               │           └────────────────┘
     │               │                    │
     │               │                    │ (continues)
     │               │                    ▼
     │               │           ┌────────────────┐
     │               │           │ ai-review-ready│
     │               │           │  (PR created)  │
     │               │           └───────┬────────┘
     │               │                   │
     │               │                   ▼
     │               │           ┌────────────────┐
     │               └───────────│    (closed)    │
     │             (new task)    │   PR merged    │
     │                           └────────────────┘
     │
     └──▶ (user can also add ai-task to existing issues)
```

---

## Workflow Lifecycle

### Phase 1: Task Discovery

```
┌─────────────────────────────────────────────────────────────────┐
│ Cron Tick (every POLL_INTERVAL_MS)                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. Query GitHub: issues with label:ai-task -label:ai-in-progress│
│ 2. Sort by priority (high > medium > low > none)                │
│ 3. Check: activeTasks.size < MAX_CONCURRENT_TASKS ?             │
│ 4. If yes, pick top issue and start task                        │
│ 5. Check ai-blocked issues for new replies                      │
│ 6. Check ai-in-progress issues for checkpoint resumption        │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Task Initialization

```
┌─────────────────────────────────────────────────────────────────┐
│ Starting Task for Issue #42                                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Remove ai-task label                                         │
│ 2. Add ai-in-progress label                                     │
│ 3. Post comment: "🤖 Starting work on this issue..."            │
│ 4. Create git worktree: .worktrees/issue-42                     │
│ 5. Create branch: ai/issue-42-{slug}                            │
│ 6. Spawn opencode process with orchestrator prompt              │
│ 7. Track in activeTasks map                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Execution (Enhanced Multi-Phase)

```
┌─────────────────────────────────────────────────────────────────┐
│ OpenCode Orchestrator Execution                                 │
├─────────────────────────────────────────────────────────────────┤
│ **Phase 3.1: Analysis**                                         │
│ 1. Read full issue context (description, comments)              │
│ 2. Analyze requirements                                         │
│ 3. Identify dependencies and edge cases                         │
│ 4. Post first progress comment: "🔖 Analysis complete..."       │
│                                                                 │
│ **Phase 3.2: Exploration**                                      │
│ 1. Explore codebase for relevant patterns                       │
│ 2. Find similar features using Librarian                        │
│ 3. Check for existing tests                                     │
│ 4. Document findings                                            │
│                                                                 │
│ **Phase 3.3: Planning**                                         │
│ 1. Create implementation plan (if complex, consult Oracle)      │
│ 2. Break into sub-phases if needed                              │
│ 3. Identify testing strategy                                    │
│ 4. Post checkpoint with plan                                    │
│                                                                 │
│ **Phase 3.4: Implementation (Ralph Loop)**                      │
│ 1. /ralph-loop "Implement feature following plan."              │
│    → Iterate until complete or max iterations                   │
│    → Auto-fix issues discovered during implementation           │
│    → Use specialists (@frontend-ui-ux-engineer, @librarian)     │
│ 2. Post progress updates every 30 minutes                       │
│ 3. Post checkpoint at each phase completion                     │
│                                                                 │
│ **Phase 3.5: Testing (Ralph Loop + Playwright)**                │
│ 1. If tests exist:                                              │
│    → /ralph-loop "Run tests. Fix failures."                     │
│ 2. If no tests exist:                                           │
│    → Generate Playwright E2E tests                              │
│    → /ralph-loop "Generate and run tests. Fix failures."        │
│ 3. Only proceed when tests pass                                 │
│                                                                 │
│ **Phase 3.6: Quality Gates**                                    │
│ 1. Run linting                                                  │
│ 2. Run type checking                                            │
│ 3. Build project                                                │
│ 4. If any gate fails:                                           │
│    → /ralph-loop "Fix quality issues."                          │
│ 5. Only proceed when all gates pass                             │
│                                                                 │
│ **Phase 3.7: CI Verification**                                  │
│ 1. Push to GitHub                                               │
│ 2. Wait for CI to complete (max CI_WAIT_TIMEOUT minutes)        │
│ 3. If CI fails → /ralph-loop to fix, wait for re-run            │
│ 4. If CI passes → Continue to documentation phase               │
│                                                                 │
│ **Phase 3.8: Documentation**                                    │
│ 1. @document-writer: Generate comprehensive docs                │
│ 2. Update README.md if user-facing                              │
│ 3. Generate API docs if applicable                              │
│ 4. Document migrations/changes                                  │
│                                                                 │
│ **Phase 3.9: PR Creation**                                      │
│ 1. Create PR with comprehensive description                     │
│ 2. Include: test results, coverage, docs link, session link     │
│ 3. Update labels to ai-review-ready                             │
│ 4. Post completion comment                                      │
│ 5. Share session                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 4: Blocking (If Needed)

```
┌─────────────────────────────────────────────────────────────────┐
│ Agent Encounters Uncertainty                                    │
├─────────────────────────────────────────────────────────────────┤
│ 1. Add ai-blocked label (keep ai-in-progress)                   │
│ 2. Post comment with specific question(s)                       │
│ 3. Include context: what was tried, what's unclear              │
│ 4. Post checkpoint for current state                            │
│ 5. OpenCode process exits gracefully                            │
│ 6. Task remains in activeTasks as "blocked"                     │
│                                                                 │
│ [Later: Human replies on GitHub]                                │
│                                                                 │
│ 7. Next cron cycle detects new comment after ai-blocked         │
│ 8. Remove ai-blocked label                                      │
│ 9. Re-spawn opencode with continuation prompt                   │
│ 10. Agent reads new comment + checkpoint, continues work        │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 5: Completion

```
┌─────────────────────────────────────────────────────────────────┐
│ Task Completed Successfully                                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. All quality gates passed                                     │
│ 2. CI status is 'success'                                       │
│ 3. PR created and linked to issue                               │
│ 4. Remove ai-in-progress label                                  │
│ 5. Add ai-review-ready label                                    │
│ 6. Post completion comment with:                                │
│    - Summary of changes                                         │
│    - Test results and coverage                                  │
│    - PR link                                                    │
│    - Session share link                                         │
│ 7. Remove from activeTasks                                      │
│ 8. Worktree retained per WORKTREE_RETENTION_DAYS                │
│                                                                 │
│ [Human reviews PR, merges or requests changes]                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Strategy

### Ralph Loop for Autonomous Testing

Use Ralph Loop strategically for test execution and fixing:

```markdown
### Testing Phase (CRITICAL - Must Complete Before PR)

**Strategy:**
1. If tests exist → Run them via Ralph Loop
2. If tests fail → Fix and retry until pass
3. If no tests exist → Generate Playwright E2E tests
4. Run generated tests → Fix failures
5. Only create PR when tests pass

**Commands:**
/ralph-loop "Ensure all existing tests pass. Fix any failures."

**OR if no tests:**
/ralph-loop "Generate comprehensive Playwright E2E tests for this feature. Run tests and fix all failures. End with <promise>DONE</promise>"

**CRITICAL RULE:** Do NOT create PR until Ralph Loop completes successfully with <promise>DONE</promise> signal.
```

### Playwright E2E Testing

For web features, comprehensive E2E testing is required:

```markdown
### E2E Testing with Playwright

**Test Coverage Requirements:**
- User flows: Login, create, update, delete
- Edge cases: Empty states, errors, invalid inputs
- Visual regression: Screenshots of key states

**Playwright Test Generation Pattern:**
1. Use @frontend-ui-ux-engineer to identify test scenarios
2. Generate Playwright tests covering:
   - Happy path
   - Error handling
   - Validation
3. Run tests locally
4. If tests fail → Fix and retry via Ralph Loop
5. Create PR only when tests pass

**Test File Location:** tests/e2e/feature-name.spec.ts
**Run Command:** bunx playwright test
```

### Test Generation Strategy

When tests don't exist:

```markdown
### When Tests Don't Exist

1. Analyze the feature requirements
2. Ask Librarian: "Find test patterns in this codebase"
3. Generate tests using Playwright (for E2E) or framework used by project
4. Ensure tests cover:
   - Core functionality
   - Error cases
   - Edge cases
5. Run and fix until passing

**Example Test Generation Prompt:**
Generate comprehensive tests for the implemented feature. Use the existing testing framework (found in tests/ directory or package.json devDependencies).

Tests must include:
- Unit tests for individual functions
- Integration tests for API endpoints
- E2E tests for user-facing features (use Playwright for web features)
```

### Test Failure Handling

```markdown
### Test Failure Handling

**When tests fail:**
1. Analyze failure root cause
2. Use Oracle: "Debug this test failure and propose fix"
3. Implement fix
4. Re-run tests
5. Repeat until all tests pass

**When tests pass:**
1. Run full test suite to ensure no regressions
2. Check coverage if supported
3. Document test coverage in PR description

**When tests are flaky:**
1. Add .skip annotation with reason
2. Create follow-up issue to fix flaky test
3. Continue with rest of test suite
```

---

## Quality Gates

### Pre-PR Quality Checklist

Before creating a PR, you MUST verify:

**1. Linting:**
```bash
npm run lint
# or bun run lint / pnpm lint / make lint
```
- Fix all lint errors
- Fix all lint warnings OR justify why warnings are acceptable

**2. Type Checking:**
```bash
npm run type-check
# or tsc --noEmit
```
- Zero type errors allowed
- Use Oracle to resolve complex type issues if needed

**3. Building:**
```bash
npm run build
# or bun run build / make build
```
- Build must succeed
- Analyze and fix any build warnings

**4. Formatting:**
```bash
npm run format
# or bunx prettier --write "**/*"
```
- Code must be properly formatted
- Commit formatting changes separately if needed

**5. Existing Tests:**
```bash
npm test
# or bun test / pytest / cargo test
```
- All tests must pass
- No test skips without justification

**CRITICAL RULE:** Do NOT create PR until ALL quality gates pass. Use Ralph Loop if gates fail repeatedly.

### Quality Gate Enforcement

```typescript
interface QualityGate {
  name: string;
  command: string[];
  required: boolean;
}

const GATES: QualityGate[] = [
  { name: "Linting", command: ["npm", "run", "lint"], required: true },
  { name: "Type Checking", command: ["npx", "tsc", "--noEmit"], required: true },
  { name: "Build", command: ["npm", "run", "build"], required: true },
  { name: "Tests", command: ["npm", "test"], required: true }
];

async function runQualityGates(worktreePath: string): Promise<boolean> {
  for (const gate of GATES) {
    const result = execSync(gate.command, { cwd: worktreePath });
    if (result.status !== 0) {
      logger.error(`${gate.name} failed`, result.stderr);
      if (gate.required) {
        throw new Error(`Required quality gate ${gate.name} failed`);
      }
    }
  }
  return true;
}
```

### Quality Gate Failure Handling

```markdown
### When Quality Gates Fail

**Automatic Retry (if enabled):**
1. Add comment: "⚠️ Quality gate failed: ${gateName}. Attempting fix..."
2. Use Ralph Loop: /ralph-loop "Fix ${gateName} errors. Run until gates pass."
3. Re-run quality gates
4. If max attempts reached → Block task and ask for guidance

**Manual Block:**
1. Add ai-blocked label
2. Post comment with failure details
3. Wait for human guidance
```

---

## CI/CD Integration

### Recommended CI Setup (GitHub Actions)

`.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: bun install
      
      - name: Run linting
        run: bun run lint
      
      - name: Type check
        run: bun run type-check
      
      - name: Run tests
        run: bun test --coverage
      
      - name: Build
        run: bun run build
      
      - name: E2E Tests
        run: bunx playwright test
        env:
          CI: true
```

### CI Result Interpretation

```markdown
### Interpreting CI Results

**Before Creating PR:**

1. Push branch to GitHub
2. Wait for CI to complete (max CI_WAIT_TIMEOUT_MINUTES)
3. If CI fails:
   → Use Ralph Loop: /ralph-loop "Fix CI failures. Re-run tests. Don't create PR until CI passes."
4. If CI passes:
   - Document CI results in PR description
   - Include test coverage report
   - Continue to PR creation

**CI as Quality Gate:**

CRITICAL RULE: Do NOT create PR until:
1. CI status is 'success'
2. All quality gates pass
3. Tests pass
```

### CI Status Checking

```typescript
async function waitForCI(branchName: string): Promise<boolean> {
  const maxWait = this.config.ciWaitTimeoutMinutes * 60 * 1000;
  
  for (let i = 0; i < maxWait; i += 30000) {
    const checks = await github.rest.checks.listForRef({
      owner: this.config.githubRepo.owner,
      repo: this.config.githubRepo.repo,
      ref: branchName
    });
    
    const latestCheck = checks.data.check_runs[0];
    
    if (latestCheck?.conclusion === 'success') {
      return true;
    } else if (latestCheck?.conclusion === 'failure') {
      return false;
    }
    
    // Still running
    await sleep(30000);
  }
  
  throw new Error('CI timeout');
}
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# ============================================================
# GitHub Configuration
# ============================================================

# Personal Access Token with repo scope
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Repository to monitor (owner/repo format)
GITHUB_REPO=your-username/your-repo

# ============================================================
# Scheduler Configuration  
# ============================================================

# How often to poll GitHub (milliseconds)
POLL_INTERVAL_MS=300000

# Maximum concurrent tasks
MAX_CONCURRENT_TASKS=2

# ============================================================
# OpenCode Configuration
# ============================================================

# Path to project repository (main worktree)
PROJECT_PATH=/path/to/your/project

# Worktree directory (relative to PROJECT_PATH)
WORKTREE_DIR=.worktrees

# OpenCode model for orchestration
OPENCODE_MODEL=anthropic/claude-opus-4-5

# ============================================================
# Testing Strategy
# ============================================================

# Enable Ralph Loop for autonomous testing
RALPH_LOOP_ENABLED=true
RALPH_LOOP_MAX_ITERATIONS=100

# Enable Playwright E2E testing
PLAYWRIGHT_E2E_ENABLED=true

# Test coverage requirements (percentage)
MIN_TEST_COVERAGE=80

# ============================================================
# Quality Gates
# ============================================================

# Quality gate enforcement
ENFORCE_QUALITY_GATES=true

# Max quality gate fix attempts
MAX_QUALITY_ATTEMPTS=3

# ============================================================
# Task State Management
# ============================================================

# Checkpoint posting interval (minutes)
CHECKPOINT_INTERVAL_MINUTES=30

# Worktree retention days
WORKTREE_RETENTION_DAYS=7

# Auto-clean worktrees older than retention
AUTO_CLEAN_WORKTREES=false

# ============================================================
# CI/CD Integration
# ============================================================

# Wait for CI before PR (minutes)
CI_WAIT_TIMEOUT_MINUTES=10

# CI status as quality gate
REQUIRE_CI_PASS=true

# ============================================================
# Documentation
# ============================================================

# Auto-generate documentation
AUTO_GENERATE_DOCS=true

# Auto-update README
AUTO_UPDATE_README=true

# Documentation framework type
DOC_FRAMEWORK=typedoc

# ============================================================
# LLM Provider API Keys
# ============================================================

# Anthropic (Claude) - Required for Sisyphus
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI (ChatGPT) - Required for Oracle
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google (Gemini) - Optional
GOOGLE_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================================
# Logging & Debugging
# ============================================================

# Log level: debug, info, warn, error
LOG_LEVEL=info

# Share OpenCode sessions publicly
SHARE_SESSIONS=true

# Progress update frequency (minutes)
PROGRESS_UPDATE_INTERVAL_MINUTES=10
```

### Configuration Tables

#### Testing & Quality

| Variable | Default | Description |
|----------|---------|-------------|
| `RALPH_LOOP_ENABLED` | `true` | Enable Ralph Loop for autonomous testing |
| `RALPH_LOOP_MAX_ITERATIONS` | `100` | Max iterations before declaring failure |
| `PLAYWRIGHT_E2E_ENABLED` | `true` | Use Playwright for E2E testing |
| `ENFORCE_QUALITY_GATES` | `true` | Block PR creation until gates pass |
| `MAX_QUALITY_ATTEMPTS` | `3` | Max quality gate fix attempts |
| `MIN_TEST_COVERAGE` | `80` | Minimum test coverage percentage |

#### Task State

| Variable | Default | Description |
|----------|---------|-------------|
| `CHECKPOINT_INTERVAL_MINUTES` | `30` | Post checkpoint every X minutes |
| `WORKTREE_RETENTION_DAYS` | `7` | Keep worktrees for X days after completion |
| `AUTO_CLEAN_WORKTREES` | `false` | Automatically clean old worktrees |

#### CI/CD

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUIRE_CI_PASS` | `true` | Wait for CI success before PR |
| `CI_WAIT_TIMEOUT_MINUTES` | `10` | Max minutes to wait for CI |

---

## Prompt Engineering

### Orchestrator System Prompt

This prompt is sent to OpenCode when starting a task:

```markdown
# GitHub Task Orchestrator - Issue #{issueNumber}

You are an autonomous AI developer working on a GitHub issue. Your task is to fully implement the requested changes, run quality gates, and create a PR.

## Context

**Repository:** {owner}/{repo}
**Issue:** #{issueNumber}
**Title:** {issueTitle}
**Branch:** ai/issue-{issueNumber}-{slug}
**Worktree:** {worktreePath}

## Issue Description

{issueBody}

## Previous Comments

{issueComments}

## Your Mission

### Phase 1: Analysis & Planning
1. **Understand** - Analyze the issue thoroughly. If anything is unclear, you MUST ask for clarification by posting a comment and adding the `ai-blocked` label.
2. **Explore** - Use the codebase exploration tools to understand existing patterns, conventions, and related code.
3. **Plan** - Create a clear implementation plan. For complex tasks, consult Oracle for architecture guidance.
4. Post checkpoint comment with your plan.

### Phase 2: Implementation (Use Ralph Loop)
5. **Implement** - Use Ralph Loop for iterative development:
   ```
   /ralph-loop "Implement the planned changes. Test as you go. Don't stop until <promise>DONE</promise>."
   ```
   - Write clean, well-documented code following existing project conventions
   - Delegate to specialists when appropriate:
     - Frontend/UI work → @frontend-ui-ux-engineer
     - Documentation → @document-writer
     - Research → @librarian

### Phase 3: Testing (CRITICAL)
6. **Test** - Run existing tests. If no tests exist, generate them:
   ```
   /ralph-loop "Run all tests. If tests fail, fix them. If no tests exist, generate comprehensive tests. End with <promise>DONE</promise> when all pass."
   ```
   - For web features, use Playwright for E2E testing
   - Only proceed when ALL tests pass

### Phase 4: Quality Gates (REQUIRED)
7. **Quality Gates** - Run and pass ALL quality gates:
   - Linting: `npm run lint`
   - Type checking: `tsc --noEmit`
   - Build: `npm run build`
   - If any fail, use Ralph Loop to fix:
   ```
   /ralph-loop "Fix all quality gate failures. Re-run until all pass."
   ```

### Phase 5: CI & PR
8. **Push & Wait for CI** - Push your branch and wait for CI to pass
9. **Create PR** - Only after CI passes, create a pull request with:
   - Clear title referencing the issue
   - Description of changes
   - Test results and coverage
   - Screenshots if UI changes
10. **Report** - Post a completion comment on the issue with:
    - Summary of what was done
    - Link to PR
    - Test results
    - Session share link for full transparency

## Ralph Loop Integration

You have access to Ralph Loop - use it strategically for:

**Multi-Iteration Work:**
- Complex implementations
- Test-fix cycles
- Quality gate enforcement

**Parameters:**
- Max iterations: 100
- Completion signal: `<promise>DONE</promise>`
- Auto-continue: true

## GitHub Operations

Use the GitHub MCP to:
- Read issue and comment details
- Add/remove labels (ai-in-progress, ai-blocked, ai-review-ready)
- Post comments for progress updates and questions
- Create pull requests
- Check CI status

## Critical Rules

1. **NEVER merge PRs** - Only create them. Humans review and merge.
2. **NEVER push to main** - Only work on your feature branch.
3. **ASK when uncertain** - Better to block and ask than to implement incorrectly.
4. **QUALITY FIRST** - Do NOT create PR until all quality gates pass.
5. **CI MUST PASS** - Wait for CI success before creating PR.
6. **TEST EVERYTHING** - Use Ralph Loop to ensure tests pass.
7. **Document everything** - Your work should be self-explanatory.

## Labels Reference

- `ai-in-progress`: Currently being worked on (already applied)
- `ai-blocked`: Need clarification (add this + post comment with question)
- `ai-review-ready`: PR created (apply when done)

## Begin

Start by reading the issue carefully and exploring the codebase. Create a todo list for all the work needed, then execute methodically using Ralph Loop for implementation phases.
```

### Checkpoint Comment Template

Posted periodically during long-running tasks:

```markdown
## 🔖 Task Checkpoint

**Started:** {startTime}
**Last Update:** {timestamp}
**Elapsed:** {elapsedTime}

### ✅ Completed
- [x] {completedTodo1}
- [x] {completedTodo2}
- [x] {completedTodo3}

### 🔄 In Progress
- [ ] {currentTodo}

### 📋 Remaining
- [ ] {remainingTodo1}
- [ ] {remainingTodo2}

### Current Status
{statusDescription}

### Session ID
{sessionId}

---
_Next cron cycle will continue from this checkpoint._
```

### Progress Update Template

```markdown
## 🔄 Progress Update
**Time:** {elapsed} since start | {timestamp}

### ✅ Completed (Last Update)
{completedTodos}

### 🔄 Currently Working On
**Task:** {currentTodo}
**Approach:** {approachDescription}

### 📋 Remaining
{remainingTodos}

### 💡 Insights
{interestingDiscoveriesOrPatterns}

---
_Last updated: {timestamp}_ | Session: [{sessionId}]({shareLink})
```

### Completion Comment Template

```markdown
## ✅ Work Completed

I've finished implementing the requested changes.

### Summary
{changeSummary}

### Pull Request
🔗 #{prNumber} - {prTitle}

### Changes Made
{changesList}

### Quality Gates
- ✅ Linting: Passed
- ✅ Type Checking: Passed
- ✅ Build: Passed
- ✅ Tests: {testCount} passing ({coverage}% coverage)
- ✅ CI: Passed

### Testing
{testingNotes}

### Full Session Log
📎 [View complete AI session]({sessionShareUrl})

---
_Please review the PR and merge when ready. Feel free to request changes or ask questions._
```

### Blocked Comment Template

```markdown
## 🤔 Clarification Needed

I've started working on this issue but need some clarification before proceeding.

### Context
{whatWasAttempted}

### Questions
{specificQuestions}

### What I'm Considering
{options}

### Current Progress
📎 See checkpoint above for current state.

---
_Please reply to this comment with the needed information. I'll continue once you respond._
```

---

## Error Handling & Rollback

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **GitHub API** | Rate limit, auth failure | Exponential backoff, notify user |
| **OpenCode** | Process crash, timeout | Retry once, then block with error comment |
| **Git** | Merge conflict, push rejected | Post error, add ai-blocked label |
| **LLM** | Context overflow, API error | Session recovery (oh-my-opencode handles) |
| **Quality Gates** | Lint/type/build failures | Ralph Loop auto-fix, then block if persistent |
| **CI** | Test failures, build errors | Ralph Loop auto-fix, then block if persistent |

### Error Comment Template

```markdown
## ⚠️ Error Encountered

I encountered an error while working on this issue.

### Error Type
{errorType}

### Details
```
{errorDetails}
```

### What Was Attempted
{attemptedAction}

### Worktree Location
`.worktrees/issue-{number}`

### Session Log
📎 [View session for debugging]({sessionShareUrl})

---
_The `ai-blocked` label has been added. Please investigate and reply with guidance, or remove the `ai-task` label to cancel._
```

### Worktree Preservation Strategy

```markdown
### Worktree Preservation Rules

**NEVER immediately clean up worktree on failure.**

1. If task is blocked → Keep worktree for later continuation
2. If task fails critically → Keep worktree for manual debugging
3. If task succeeds → Keep worktree for reference (per WORKTREE_RETENTION_DAYS)
```

### Rollback Procedures

**Scenario 1: User rejects PR entirely**
```markdown
1. Add comment acknowledging rejection
2. Keep worktree intact for manual review
3. Wait for further instructions

Worktree location: `.worktrees/issue-{number}`
```

**Scenario 2: Need to restart task**
```bash
cd .worktrees/issue-42
git reset --soft HEAD~1  # Undo last commit but keep changes
# Continue from checkpoint
```

### Debugging Mode

When task fails and needs manual debugging:

```markdown
## 🐛 Debugging Mode

I've encountered issues I can't automatically resolve.

### What Happened
{errorDetails}

### Worktree Location
`.worktrees/issue-{number}`

### What You Can Do

**Option 1: Debug in worktree**
```bash
cd .worktrees/issue-42
git status
# Make manual changes and test
```

**Option 2: Provide guidance**
Reply to this comment with specific instructions.

**Option 3: Cancel task**
Remove `ai-task` label and I'll abandon this work.

### Session Log
📎 [View full session]({sessionShareUrl})
```

### Graceful Degradation

1. **Single task fails:** Mark as blocked, continue other tasks
2. **GitHub API unavailable:** Pause polling, retry with backoff
3. **All LLM providers down:** Pause all tasks, alert user
4. **Cron process crash:** State preserved on GitHub; restart resumes from checkpoints

---

## Security Considerations

### Token Security

| Risk | Mitigation |
|------|------------|
| Token in logs | Never log full token; mask in output |
| Token in comments | Never include tokens in GitHub comments |
| Token exposure | Store in `.env`, add to `.gitignore` |
| Excessive scope | Use fine-grained PAT with minimal permissions |

### Required PAT Permissions

For fine-grained Personal Access Token:

```
Repository permissions:
  - Contents: Read and write (for pushing branches)
  - Issues: Read and write (for labels/comments)
  - Pull requests: Read and write (for creating PRs)
  - Checks: Read (for CI status)
  - Metadata: Read (required)
```

### Code Execution Safety

| Risk | Mitigation |
|------|------------|
| Malicious issue content | Agent runs in worktree, not main |
| Destructive commands | PRs require human review before merge |
| Secrets in code | Agent instructed never to commit secrets |
| Infinite loops | Ralph Loop has max iterations, oh-my-opencode has task timeout |

### Worktree Isolation

- Each task operates in isolated worktree
- Changes never affect main directly
- Failed tasks can be discarded entirely
- No cross-task interference

---

## Future Enhancements

### Phase 2: Bot Identity

Replace PAT with GitHub App for `[bot]` identity:
1. Create custom GitHub App
2. Implement token refresh in cron service
3. All actions appear as `your-app[bot]`

### Phase 3: Multi-Repository

Extend to multiple repositories:
```javascript
{
  repositories: [
    { owner: "myorg", repo: "frontend" },
    { owner: "myorg", repo: "backend" },
    { owner: "myorg", repo: "shared-lib" }
  ]
}
```

### Phase 4: Advanced Scheduling

- Priority decay (old low-priority tasks escalate)
- Time-based scheduling (don't run during work hours)
- Resource-aware scaling (adjust concurrency based on load)

### Phase 5: Metrics & Dashboard

- Task completion rates
- Average time per task
- Token usage tracking
- Quality gate pass rates
- Test coverage trends
- Web dashboard for monitoring

### Phase 6: PR Change Requests

Handle PR review feedback:
1. Watch for change request comments on `ai-review-ready` PRs
2. Resume work to address feedback
3. Push updates to same branch
4. Wait for CI, re-submit for review

---

## Implementation Roadmap

### MVP (This Implementation)

| Component | Priority | Complexity |
|-----------|----------|------------|
| Node-cron scheduler | P0 | Medium |
| GitHub polling | P0 | Low |
| Label state management | P0 | Low |
| Worktree management | P0 | Medium |
| OpenCode spawning | P0 | Medium |
| Orchestrator prompt | P0 | Medium |
| **Ralph Loop integration** | P0 | Medium |
| **Quality gates** | P0 | Medium |
| **Playwright E2E testing** | P1 | High |
| **CI/CD integration** | P1 | Medium |
| Progress comments | P1 | Low |
| Session sharing | P1 | Low |
| Blocked task detection | P1 | Medium |
| Continuation flow | P1 | Medium |
| **Checkpoint management** | P1 | Medium |
| Error handling | P1 | Medium |
| **Worktree preservation** | P2 | Low |
| **Documentation automation** | P2 | Medium |

### Project Structure

```
opencode-github-orchestrator/
├── src/
│   ├── index.ts              # Entry point, cron setup
│   ├── config.ts             # Environment loading
│   ├── github/
│   │   ├── client.ts         # GitHub API wrapper
│   │   ├── issues.ts         # Issue queries
│   │   ├── labels.ts         # Label management
│   │   ├── comments.ts       # Comment templates
│   │   └── ci.ts             # CI status checking
│   ├── tasks/
│   │   ├── manager.ts        # Task lifecycle
│   │   ├── worktree.ts       # Git worktree ops
│   │   ├── opencode.ts       # OpenCode process management
│   │   ├── quality.ts        # Quality gate runner
│   │   ├── checkpoint.ts     # Checkpoint management
│   │   └── ralph-loop.ts     # Ralph Loop tracking
│   ├── prompts/
│   │   ├── orchestrator.ts   # Main prompt template
│   │   ├── continuation.ts   # Unblock continuation
│   │   └── templates.ts      # Comment templates
│   └── utils/
│       ├── logger.ts         # Logging utilities
│       └── slug.ts           # Title-to-slug conversion
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Appendix

### A. GitHub API Queries

**Find tasks to process:**
```graphql
query FindAiTasks($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    issues(
      first: 10
      states: OPEN
      labels: ["ai-task"]
      orderBy: {field: CREATED_AT, direction: ASC}
    ) {
      nodes {
        number
        title
        body
        labels(first: 10) {
          nodes { name }
        }
        comments(last: 10) {
          nodes {
            body
            createdAt
            author { login }
          }
        }
      }
    }
  }
}
```

**Check for blocked task replies:**
```graphql
query CheckBlockedTasks($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    issues(
      first: 10
      states: OPEN
      labels: ["ai-blocked"]
    ) {
      nodes {
        number
        comments(last: 5) {
          nodes {
            createdAt
            author { login }
          }
        }
      }
    }
  }
}
```

### B. Git Worktree Commands

```bash
# Create worktree with new branch from latest main
git fetch origin main
git worktree add .worktrees/issue-42 -b ai/issue-42-slug origin/main

# Work in worktree
cd .worktrees/issue-42
# ... make changes ...
git add .
git commit -m "feat: implement feature X"
git push -u origin ai/issue-42-slug

# List all worktrees
git worktree list

# Clean up (after PR merged, respecting retention policy)
git worktree remove .worktrees/issue-42
git branch -d ai/issue-42-slug
```

### C. OpenCode CLI Commands

```bash
# Run with message (headless)
opencode run "Your prompt here"

# Continue session
opencode run --session <session-id> "Continue message"

# With specific model
opencode run --model anthropic/claude-opus-4-5 "Message"

# Share session
# (Done via /share command within session)
```

### D. Ralph Loop Commands

```bash
# Start Ralph Loop for implementation
/ralph-loop "Implement feature X. Test thoroughly. End with <promise>DONE</promise>."

# Ralph Loop for quality fixes
/ralph-loop "Fix all lint and type errors. Re-run until all pass."

# Ralph Loop for testing
/ralph-loop "Run all tests. Fix failures. Generate missing tests. End with <promise>DONE</promise>."
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-02 | AI-Assisted | Initial specification |
| 2.0 | 2026-01-02 | AI-Assisted | Added Ralph Loop, quality gates, Playwright E2E, CI/CD integration, checkpoint management, rollback/debugging |

---

**End of Technical Specification v2.0**
