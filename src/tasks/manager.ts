import { Config, getRepoInfo, getBranchName } from '../config.js';
import { GitHubClient, Issue } from '../github/client.js';
import { WorktreeManager } from './worktree.js';
import { OpenCodeManager, OpenCodeTaskStatus } from './opencode.js';
import { QualityGateRunner } from './quality.js';
import { createLogger } from '../utils/logger.js';
import { createBranchSlug } from '../utils/slug.js';

const logger = createLogger('task-manager');

export type TaskPhase =
    | 'pending'
    | 'analysis'
    | 'implementation'
    | 'testing'
    | 'quality'
    | 'ci'
    | 'documentation'
    | 'pr'
    | 'completed'
    | 'blocked'
    | 'failed';

export interface TaskContext {
    issueNumber: number;
    issue: Issue;
    branchName: string;
    worktreePath: string;
    phase: TaskPhase;
    startedAt: Date;
    sessionId?: string;
    process?: OpenCodeTaskStatus;
}

/**
 * Task lifecycle manager
 */
export class TaskManager {
    private activeTasks: Map<number, TaskContext> = new Map();
    private github: GitHubClient;
    private worktrees: WorktreeManager;
    private opencode: OpenCodeManager;
    private quality: QualityGateRunner;

    constructor(private config: Config) {
        this.github = new GitHubClient(config);
        this.worktrees = new WorktreeManager(config);
        this.opencode = new OpenCodeManager(config, (issueNumber) => {
            this.activeTasks.delete(issueNumber);
            logger.info({ issueNumber, activeCount: this.activeTasks.size }, 'Task completed, slot freed');
        });
        this.quality = new QualityGateRunner(config);
    }

    /**
     * Start a new task
     */
    async startTask(issue: Issue): Promise<TaskContext> {
        // Guard: Don't start if already tracking this issue
        if (this.activeTasks.has(issue.number)) {
            logger.warn({ issueNumber: issue.number }, 'Task already in progress, skipping duplicate start');
            return this.activeTasks.get(issue.number)!;
        }

        logger.info({ issueNumber: issue.number, title: issue.title }, 'Starting task');

        const slug = createBranchSlug(issue.title);
        const branchName = getBranchName(issue.number, slug);

        // Create worktree
        const worktreePath = await this.worktrees.createWorktree(issue.number, branchName);

        // NOTE: OpenCode handles all GitHub operations (labels, comments) via gh CLI
        // See prompts/orchestrator.ts "IMMEDIATE First Actions" section

        // Start OpenCode process
        const process = await this.opencode.startTask(issue, worktreePath, branchName);

        const context: TaskContext = {
            issueNumber: issue.number,
            issue,
            branchName,
            worktreePath,
            phase: 'analysis',
            startedAt: new Date(),
            sessionId: process.sessionId,
            process,
        };

        this.activeTasks.set(issue.number, context);
        return context;
    }

    /**
     * Continue a blocked task
     */
    async continueBlockedTask(issue: Issue): Promise<TaskContext | null> {
        logger.info({ issueNumber: issue.number }, 'Continuing blocked task');

        // Get latest human comment
        const latestComment = this.github.getLatestHumanComment(issue);
        if (!latestComment) {
            logger.warn({ issueNumber: issue.number }, 'No human comment found');
            return null;
        }

        // Get existing context or create new one
        let context = this.activeTasks.get(issue.number);
        const worktreePath = this.worktrees.getPath(issue.number);
        const branchName = this.worktrees.getCurrentBranch(issue.number);

        if (!branchName) {
            logger.error({ issueNumber: issue.number }, 'Could not find branch for task');
            return null;
        }

        // NOTE: OpenCode handles removing ai-blocked label via gh CLI

        // Get previous session ID from context or comments
        const previousSessionId = context?.sessionId || 'unknown';

        // Start continuation
        const process = await this.opencode.continueTask(
            issue,
            worktreePath,
            previousSessionId,
            latestComment.body
        );

        context = {
            issueNumber: issue.number,
            issue,
            branchName,
            worktreePath,
            phase: 'implementation',
            startedAt: context?.startedAt || new Date(),
            sessionId: process.sessionId,
            process,
        };

        this.activeTasks.set(issue.number, context);
        return context;
    }

    // NOTE: The following methods were removed as OpenCode now handles all GitHub operations:
    // - markBlocked() - OpenCode posts comments and adds labels via gh CLI
    // - completeTask() - OpenCode posts completion comments and manages labels via gh CLI
    // - handleFailure() - OpenCode posts error comments via gh CLI
    // - postProgress() - OpenCode posts progress updates via gh CLI
    // - postCheckpoint() - OpenCode posts checkpoints via gh CLI

    /**
     * Get task context
     */
    getTask(issueNumber: number): TaskContext | undefined {
        return this.activeTasks.get(issueNumber);
    }

    /**
     * Get all active tasks
     */
    getActiveTasks(): TaskContext[] {
        return Array.from(this.activeTasks.values());
    }

    /**
     * Get count of active tasks
     */
    getActiveCount(): number {
        return this.activeTasks.size;
    }

    /**
     * Check if can start new task
     */
    canStartNewTask(): boolean {
        return this.activeTasks.size < this.config.scheduler.maxConcurrentTasks;
    }

    /**
     * Cleanup on shutdown
     */
    shutdown(): void {
        logger.info('Shutting down task manager');
        this.opencode.killAll();
    }
}
