import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
    // GitHub
    github: z.object({
        token: z.string().min(1, 'GITHUB_TOKEN is required'),
        repo: z.string().regex(/^[^/]+\/[^/]+$/, 'GITHUB_REPO must be in owner/repo format'),
        username: z.string().min(1, 'GITHUB_USERNAME is required'),
        allowedUsers: z.array(z.string()).default([]),
    }),

    // Scheduler
    scheduler: z.object({
        pollIntervalMs: z.number().min(10000).default(300000),
        maxConcurrentTasks: z.number().min(1).max(10).default(2),
    }),

    // OpenCode
    opencode: z.object({
        serverUrl: z.string().url().default('http://localhost:4096'),
        projectPath: z.string().min(1, 'PROJECT_PATH is required'),
        worktreeDir: z.string().default('.worktrees'),
        model: z.string().optional(),
    }),

    // Testing
    testing: z.object({
        ralphLoopEnabled: z.boolean().default(true),
        ralphLoopMaxIterations: z.number().min(1).max(500).default(100),
        playwrightEnabled: z.boolean().default(true),
        minTestCoverage: z.number().min(0).max(100).default(80),
    }),

    // Quality Gates
    quality: z.object({
        enforceGates: z.boolean().default(true),
        maxAttempts: z.number().min(1).max(10).default(3),
    }),

    // Task State
    taskState: z.object({
        checkpointIntervalMinutes: z.number().min(5).max(120).default(30),
        worktreeRetentionDays: z.number().min(1).max(90).default(7),
        autoCleanWorktrees: z.boolean().default(false),
    }),

    // CI/CD
    cicd: z.object({
        waitTimeoutMinutes: z.number().min(1).max(60).default(10),
        requirePass: z.boolean().default(true),
    }),

    // Documentation
    documentation: z.object({
        autoGenerate: z.boolean().default(true),
        autoUpdateReadme: z.boolean().default(true),
        framework: z.string().default('typedoc'),
    }),

    // Logging
    logging: z.object({
        level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        shareSessions: z.boolean().default(true),
        progressUpdateIntervalMinutes: z.number().min(1).max(60).default(10),
    }),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated string to array of trimmed strings
 */
function parseStringArray(value: string | undefined): string[] {
    if (!value || value.trim() === '') return [];
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Load and validate configuration from environment
 */
export function loadConfig(): Config {
    const rawConfig = {
        github: {
            token: process.env.GITHUB_TOKEN || '',
            repo: process.env.GITHUB_REPO || '',
            username: process.env.GITHUB_USERNAME || '',
            allowedUsers: parseStringArray(process.env.ALLOWED_USERS),
        },
        scheduler: {
            pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 300000),
            maxConcurrentTasks: parseNumber(process.env.MAX_CONCURRENT_TASKS, 2),
        },
        opencode: {
            serverUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:4096',
            projectPath: process.env.PROJECT_PATH || '',
            worktreeDir: process.env.WORKTREE_DIR || '.worktrees',
            // model: process.env.OPENCODE_MODEL,
        },
        testing: {
            ralphLoopEnabled: parseBoolean(process.env.RALPH_LOOP_ENABLED, true),
            ralphLoopMaxIterations: parseNumber(process.env.RALPH_LOOP_MAX_ITERATIONS, 100),
            playwrightEnabled: parseBoolean(process.env.PLAYWRIGHT_E2E_ENABLED, true),
            minTestCoverage: parseNumber(process.env.MIN_TEST_COVERAGE, 80),
        },
        quality: {
            enforceGates: parseBoolean(process.env.ENFORCE_QUALITY_GATES, true),
            maxAttempts: parseNumber(process.env.MAX_QUALITY_ATTEMPTS, 3),
        },
        taskState: {
            checkpointIntervalMinutes: parseNumber(process.env.CHECKPOINT_INTERVAL_MINUTES, 30),
            worktreeRetentionDays: parseNumber(process.env.WORKTREE_RETENTION_DAYS, 7),
            autoCleanWorktrees: parseBoolean(process.env.AUTO_CLEAN_WORKTREES, false),
        },
        cicd: {
            waitTimeoutMinutes: parseNumber(process.env.CI_WAIT_TIMEOUT_MINUTES, 10),
            requirePass: parseBoolean(process.env.REQUIRE_CI_PASS, true),
        },
        documentation: {
            autoGenerate: parseBoolean(process.env.AUTO_GENERATE_DOCS, true),
            autoUpdateReadme: parseBoolean(process.env.AUTO_UPDATE_README, true),
            framework: process.env.DOC_FRAMEWORK || 'typedoc',
        },
        logging: {
            level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
            shareSessions: parseBoolean(process.env.SHARE_SESSIONS, true),
            progressUpdateIntervalMinutes: parseNumber(process.env.PROGRESS_UPDATE_INTERVAL_MINUTES, 10),
        },
    };

    const result = configSchema.safeParse(rawConfig);

    if (!result.success) {
        console.error('Configuration validation failed:');
        result.error.errors.forEach((err) => {
            console.error(`  - ${err.path.join('.')}: ${err.message}`);
        });
        process.exit(1);
    }

    return result.data;
}

/**
 * Get parsed repository owner and name
 */
export function getRepoInfo(config: Config): { owner: string; repo: string } {
    const [owner, repo] = config.github.repo.split('/');
    return { owner, repo };
}

/**
 * Get worktree path for an issue
 */
export function getWorktreePath(config: Config, issueNumber: number): string {
    return path.join(config.opencode.projectPath, config.opencode.worktreeDir, `issue-${issueNumber}`);
}

/**
 * Get branch name for an issue
 */
export function getBranchName(issueNumber: number, slug: string): string {
    return `ai/issue-${issueNumber}-${slug}`;
}
