import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Config, getWorktreePath } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('worktree');

/**
 * Git worktree operations
 */
export class WorktreeManager {
    constructor(private config: Config) { }

    /**
     * Get the default branch name from origin (main or master)
     */
    private getDefaultBranch(): string {
        try {
            // Try to get the default branch from origin's HEAD
            const output = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
                cwd: this.config.opencode.projectPath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            // Output is like "refs/remotes/origin/main" - extract branch name
            return output.trim().replace('refs/remotes/origin/', '');
        } catch {
            // Fallback: check if origin/main exists, otherwise use master
            try {
                execSync('git show-ref --verify refs/remotes/origin/main', {
                    cwd: this.config.opencode.projectPath,
                    stdio: 'pipe',
                });
                return 'main';
            } catch {
                return 'master';
            }
        }
    }

    /**
     * Create a new worktree for an issue
     */
    async createWorktree(issueNumber: number, branchName: string): Promise<string> {
        const worktreePath = getWorktreePath(this.config, issueNumber);
        const worktreeDir = path.dirname(worktreePath);

        // Ensure worktree directory exists
        if (!fs.existsSync(worktreeDir)) {
            fs.mkdirSync(worktreeDir, { recursive: true });
        }

        // Check if worktree already exists
        if (fs.existsSync(worktreePath)) {
            logger.info({ issueNumber, worktreePath }, 'Worktree already exists');
            return worktreePath;
        }

        try {
            // Get the default branch name from origin
            const defaultBranch = this.getDefaultBranch();

            // Fetch latest from origin
            execSync(`git fetch origin ${defaultBranch}`, {
                cwd: this.config.opencode.projectPath,
                stdio: 'pipe',
            });

            // Check if branch already exists
            let branchExists = false;
            try {
                execSync(`git show-ref --verify refs/heads/${branchName}`, {
                    cwd: this.config.opencode.projectPath,
                    stdio: 'pipe',
                });
                branchExists = true;
            } catch {
                // Branch doesn't exist, that's fine
            }

            if (branchExists) {
                // Use existing branch
                logger.info({ issueNumber, branchName }, 'Branch already exists, reusing it');
                execSync(`git worktree add "${worktreePath}" ${branchName}`, {
                    cwd: this.config.opencode.projectPath,
                    stdio: 'pipe',
                });
            } else {
                // Create worktree with new branch from origin's default branch
                execSync(`git worktree add "${worktreePath}" -b ${branchName} origin/${defaultBranch}`, {
                    cwd: this.config.opencode.projectPath,
                    stdio: 'pipe',
                });
            }

            logger.info({ issueNumber, worktreePath, branchName }, 'Created worktree');
            return worktreePath;
        } catch (error: unknown) {
            // Format error message for readability
            const err = error as { stderr?: Buffer; message?: string };
            const errorMessage = err.stderr ? err.stderr.toString() : err.message || String(error);
            logger.error({ issueNumber, error: errorMessage }, 'Failed to create worktree');
            throw error;
        }
    }

    /**
     * Check if a worktree exists for an issue
     */
    worktreeExists(issueNumber: number): boolean {
        const worktreePath = getWorktreePath(this.config, issueNumber);
        return fs.existsSync(worktreePath);
    }

    /**
     * Get the path to a worktree
     */
    getPath(issueNumber: number): string {
        return getWorktreePath(this.config, issueNumber);
    }

    /**
     * Remove a worktree
     */
    async removeWorktree(issueNumber: number): Promise<void> {
        const worktreePath = getWorktreePath(this.config, issueNumber);

        if (!fs.existsSync(worktreePath)) {
            logger.debug({ issueNumber }, 'Worktree does not exist');
            return;
        }

        try {
            execSync(`git worktree remove "${worktreePath}" --force`, {
                cwd: this.config.opencode.projectPath,
                stdio: 'pipe',
            });

            logger.info({ issueNumber, worktreePath }, 'Removed worktree');
        } catch (error) {
            logger.error({ error, issueNumber }, 'Failed to remove worktree');
            throw error;
        }
    }

    /**
     * List all worktrees
     */
    listWorktrees(): string[] {
        try {
            const output = execSync('git worktree list --porcelain', {
                cwd: this.config.opencode.projectPath,
                encoding: 'utf-8',
            });

            const worktrees: string[] = [];
            const lines = output.split('\n');

            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    worktrees.push(line.replace('worktree ', ''));
                }
            }

            return worktrees;
        } catch (error) {
            logger.error({ error }, 'Failed to list worktrees');
            return [];
        }
    }

    /**
     * Clean old worktrees based on retention policy
     */
    async cleanOldWorktrees(): Promise<void> {
        if (!this.config.taskState.autoCleanWorktrees) {
            return;
        }

        const worktreeDir = path.join(
            this.config.opencode.projectPath,
            this.config.opencode.worktreeDir
        );

        if (!fs.existsSync(worktreeDir)) {
            return;
        }

        const retentionMs = this.config.taskState.worktreeRetentionDays * 24 * 60 * 60 * 1000;
        const now = Date.now();

        const entries = fs.readdirSync(worktreeDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const worktreePath = path.join(worktreeDir, entry.name);
            const stats = fs.statSync(worktreePath);
            const age = now - stats.mtimeMs;

            if (age > retentionMs) {
                try {
                    execSync(`git worktree remove "${worktreePath}" --force`, {
                        cwd: this.config.opencode.projectPath,
                        stdio: 'pipe',
                    });
                    logger.info({ worktreePath, ageDays: Math.floor(age / (24 * 60 * 60 * 1000)) }, 'Cleaned old worktree');
                } catch (error) {
                    logger.warn({ error, worktreePath }, 'Failed to clean worktree');
                }
            }
        }
    }

    /**
     * Push a branch to origin
     */
    async pushBranch(issueNumber: number, branchName: string): Promise<void> {
        const worktreePath = getWorktreePath(this.config, issueNumber);

        try {
            execSync(`git push -u origin ${branchName}`, {
                cwd: worktreePath,
                stdio: 'pipe',
            });
            logger.info({ issueNumber, branchName }, 'Pushed branch to origin');
        } catch (error) {
            logger.error({ error, issueNumber, branchName }, 'Failed to push branch');
            throw error;
        }
    }

    /**
     * Get the current branch name in a worktree
     */
    getCurrentBranch(issueNumber: number): string | null {
        const worktreePath = getWorktreePath(this.config, issueNumber);

        if (!fs.existsSync(worktreePath)) {
            return null;
        }

        try {
            const output = execSync('git rev-parse --abbrev-ref HEAD', {
                cwd: worktreePath,
                encoding: 'utf-8',
            });
            return output.trim();
        } catch (error) {
            logger.error({ error, issueNumber }, 'Failed to get current branch');
            return null;
        }
    }
}
