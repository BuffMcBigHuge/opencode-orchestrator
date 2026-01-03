import cron from 'node-cron';
import process from 'node:process';
import { loadConfig, Config } from './config.js';
import { GitHubClient, Issue } from './github/client.js';
import { Labels, isReadyForPickup, isBlocked } from './github/labels.js';
import { TaskManager } from './tasks/manager.js';
import { WorktreeManager } from './tasks/worktree.js';
import { OpenCodeServerManager } from './tasks/opencode-server.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('orchestrator');

/**
 * Main orchestrator class
 */
class GitHubTaskOrchestrator {
    private config: Config;
    private github: GitHubClient;
    private taskManager: TaskManager;
    private worktrees: WorktreeManager;
    private openCodeServer: OpenCodeServerManager;
    private isShuttingDown = false;

    constructor() {
        this.config = loadConfig();
        this.github = new GitHubClient(this.config);
        this.taskManager = new TaskManager(this.config);
        this.worktrees = new WorktreeManager(this.config);
        this.openCodeServer = new OpenCodeServerManager(this.config);
    }

    /**
     * Start the orchestrator
     */
    async start(): Promise<void> {
        logger.info('Starting GitHub Task Orchestrator v2.0');
        logger.info({
            repo: this.config.github.repo,
            pollInterval: this.config.scheduler.pollIntervalMs,
            maxConcurrent: this.config.scheduler.maxConcurrentTasks,
        }, 'Configuration loaded');

        // Setup graceful shutdown
        this.setupShutdownHandlers();

        // Start OpenCode server (or connect to existing)
        logger.info('Starting OpenCode server...');
        await this.openCodeServer.start();
        logger.info('OpenCode server ready');

        // Run initial poll
        logger.info('Running initial poll...');
        await this.poll();
        logger.info('Initial poll completed');

        // Schedule polling
        const intervalMs = this.config.scheduler.pollIntervalMs;
        const intervalMinutes = Math.ceil(intervalMs / 60000);

        // Use cron for more reliable scheduling
        // Poll every minute if interval is less than 1 minute, otherwise use the configured interval
        const cronExpression = intervalMinutes <= 1
            ? '* * * * *'  // Every minute
            : `*/${intervalMinutes} * * * *`;  // Every N minutes

        cron.schedule(cronExpression, async () => {
            if (!this.isShuttingDown) {
                await this.poll();
            }
        });

        logger.info({ cronExpression }, 'Scheduler started');
        logger.info('✅ Orchestrator is running and waiting for tasks. Press Ctrl+C to stop.');
    }

    /**
     * Poll GitHub for tasks
     */
    private async poll(): Promise<void> {
        logger.debug('Polling GitHub for tasks...');

        try {
            // Check for new tasks
            await this.checkNewTasks();

            // Check for blocked tasks with replies
            await this.checkBlockedTasks();

            // Clean old worktrees if enabled
            await this.worktrees.cleanOldWorktrees();
        } catch (error) {
            logger.error({ error }, 'Error during poll');
        }
    }

    /**
     * Check for new tasks to pick up
     */
    private async checkNewTasks(): Promise<void> {
        if (!this.taskManager.canStartNewTask()) {
            logger.debug({
                active: this.taskManager.getActiveCount(),
                max: this.config.scheduler.maxConcurrentTasks
            }, 'At max concurrent tasks');
            return;
        }

        // Get issues with ai-task label, excluding those already in progress
        const issues = await this.github.getIssuesWithLabel(
            Labels.AI_TASK,
            [Labels.AI_IN_PROGRESS]
        );

        if (issues.length === 0) {
            logger.debug('No new tasks found');
            return;
        }

        // Sort by priority
        const sorted = this.github.sortByPriority(issues);

        // Start tasks up to max concurrent
        for (const issue of sorted) {
            if (!this.taskManager.canStartNewTask()) {
                break;
            }

            if (isReadyForPickup(issue)) {
                try {
                    await this.taskManager.startTask(issue);
                    logger.info({ issueNumber: issue.number, title: issue.title }, 'Started task');
                } catch (error: any) {
                    logger.error({
                        issueNumber: issue.number,
                        errorMessage: error.message,
                        errorStack: error.stack,
                        rawError: error
                    }, 'Failed to start task');
                }
            }
        }
    }

    /**
     * Check for blocked tasks that have received replies
     */
    private async checkBlockedTasks(): Promise<void> {
        // Get issues with ai-blocked label
        const blockedIssues = await this.github.getIssuesWithLabel(Labels.AI_BLOCKED);

        for (const issue of blockedIssues) {
            // Check if there's a new comment from a human
            const task = this.taskManager.getTask(issue.number);
            const blockedSince = task?.startedAt || new Date(0);

            if (this.github.hasNewComments(issue, blockedSince)) {
                try {
                    await this.taskManager.continueBlockedTask(issue);
                    logger.info({ issueNumber: issue.number }, 'Resumed blocked task');
                } catch (error) {
                    logger.error({ error, issueNumber: issue.number }, 'Failed to resume task');
                }
            }
        }
    }

    /**
     * Setup graceful shutdown handlers
     */
    private setupShutdownHandlers(): void {
        const shutdown = async (signal: string) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            logger.info({ signal }, 'Received shutdown signal');

            // Cleanup tasks
            this.taskManager.shutdown();

            // Stop OpenCode server if we spawned it
            if (this.openCodeServer.isOwnedProcess()) {
                await this.openCodeServer.stop();
            }

            logger.info('Shutdown complete');
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
}

// Main entry point
async function main(): Promise<void> {
    try {
        console.log('🚀 Starting OpenCode GitHub Orchestrator...');
        const orchestrator = new GitHubTaskOrchestrator();
        await orchestrator.start();
        // Process will stay alive due to cron scheduler
    } catch (error) {
        console.error('❌ Failed to start orchestrator:', error);
        logger.error({ error }, 'Failed to start orchestrator');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
