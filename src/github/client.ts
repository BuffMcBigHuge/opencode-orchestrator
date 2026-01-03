import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import { Config, getRepoInfo } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('github-client');

export interface Issue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    comments: Comment[];
    createdAt: string;
    updatedAt: string;
}

export interface Comment {
    id: number;
    body: string;
    author: string;
    createdAt: string;
}

export interface PullRequest {
    number: number;
    title: string;
    url: string;
    state: string;
}

export type Priority = 'high' | 'medium' | 'low' | 'none';

/**
 * GitHub client for API operations
 */
export class GitHubClient {
    private octokit: Octokit;
    private graphqlClient: typeof graphql;
    private owner: string;
    private repo: string;
    private username: string;

    constructor(private config: Config) {
        this.octokit = new Octokit({ auth: config.github.token });
        this.graphqlClient = graphql.defaults({
            headers: {
                authorization: `token ${config.github.token}`,
            },
        });

        const repoInfo = getRepoInfo(config);
        this.owner = repoInfo.owner;
        this.repo = repoInfo.repo;
        this.username = config.github.username;
    }

    /**
     * Get issues with a specific label
     */
    async getIssuesWithLabel(label: string, excludeLabels: string[] = []): Promise<Issue[]> {
        try {
            const response = await this.octokit.issues.listForRepo({
                owner: this.owner,
                repo: this.repo,
                labels: label,
                state: 'open',
                per_page: 20,
                sort: 'created',
                direction: 'asc',
            });

            // Filter out issues with excluded labels
            const filtered = response.data.filter((issue) => {
                const issueLabels = issue.labels.map((l) => (typeof l === 'string' ? l : l.name || ''));
                return !excludeLabels.some((exclude) => issueLabels.includes(exclude));
            });

            // Fetch comments for each issue
            const issues: Issue[] = await Promise.all(
                filtered.map(async (issue) => {
                    const comments = await this.getIssueComments(issue.number);
                    return {
                        number: issue.number,
                        title: issue.title,
                        body: issue.body || '',
                        labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
                        comments,
                        createdAt: issue.created_at,
                        updatedAt: issue.updated_at,
                    };
                })
            );

            return issues;
        } catch (error) {
            logger.error({ error }, 'Failed to fetch issues');
            throw error;
        }
    }

    /**
     * Get comments for an issue (with pagination to get all comments)
     */
    async getIssueComments(issueNumber: number): Promise<Comment[]> {
        try {
            const allComments: Comment[] = [];
            let page = 1;
            const perPage = 100; // Maximum per page
            
            while (true) {
                const response = await this.octokit.issues.listComments({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: issueNumber,
                    per_page: perPage,
                    page,
                });

                if (response.data.length === 0) {
                    break;
                }

                const pageComments = response.data.map((comment) => ({
                    id: comment.id,
                    body: comment.body || '',
                    author: comment.user?.login || 'unknown',
                    createdAt: comment.created_at,
                }));

                allComments.push(...pageComments);

                // If we got fewer than perPage, we've reached the end
                if (response.data.length < perPage) {
                    break;
                }

                page++;
            }

            logger.debug({ issueNumber, commentCount: allComments.length }, 'Fetched all comments');
            return allComments;
        } catch (error) {
            logger.error({ error, issueNumber }, 'Failed to fetch comments');
            return [];
        }
    }

    /**
     * Add a label to an issue
     */
    async addLabel(issueNumber: number, label: string): Promise<void> {
        try {
            await this.octokit.issues.addLabels({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                labels: [label],
            });
            logger.debug({ issueNumber, label }, 'Added label');
        } catch (error) {
            logger.error({ error, issueNumber, label }, 'Failed to add label');
            throw error;
        }
    }

    /**
     * Remove a label from an issue
     */
    async removeLabel(issueNumber: number, label: string): Promise<void> {
        try {
            await this.octokit.issues.removeLabel({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                name: label,
            });
            logger.debug({ issueNumber, label }, 'Removed label');
        } catch (error) {
            // Ignore error if label doesn't exist
            if ((error as any).status !== 404) {
                logger.error({ error, issueNumber, label }, 'Failed to remove label');
                throw error;
            }
        }
    }

    /**
     * Post a comment on an issue
     */
    async postComment(issueNumber: number, body: string): Promise<void> {
        try {
            await this.octokit.issues.createComment({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                body,
            });
            logger.debug({ issueNumber }, 'Posted comment');
        } catch (error) {
            logger.error({ error, issueNumber }, 'Failed to post comment');
            throw error;
        }
    }

    /**
     * Create a pull request
     */
    async createPullRequest(
        title: string,
        body: string,
        head: string,
        base: string = 'main'
    ): Promise<PullRequest> {
        try {
            const response = await this.octokit.pulls.create({
                owner: this.owner,
                repo: this.repo,
                title,
                body,
                head,
                base,
            });

            logger.info({ prNumber: response.data.number, title }, 'Created pull request');

            return {
                number: response.data.number,
                title: response.data.title,
                url: response.data.html_url,
                state: response.data.state,
            };
        } catch (error) {
            logger.error({ error, title, head }, 'Failed to create pull request');
            throw error;
        }
    }

    /**
     * Get CI status for a branch/commit
     */
    async getCIStatus(ref: string): Promise<'success' | 'failure' | 'pending' | 'unknown'> {
        try {
            const response = await this.octokit.checks.listForRef({
                owner: this.owner,
                repo: this.repo,
                ref,
            });

            if (response.data.check_runs.length === 0) {
                return 'unknown';
            }

            const latestRun = response.data.check_runs[0];

            if (latestRun.status !== 'completed') {
                return 'pending';
            }

            return latestRun.conclusion === 'success' ? 'success' : 'failure';
        } catch (error) {
            logger.error({ error, ref }, 'Failed to get CI status');
            return 'unknown';
        }
    }

    /**
     * Wait for CI to complete
     */
    async waitForCI(ref: string, timeoutMinutes: number): Promise<boolean> {
        const maxWait = timeoutMinutes * 60 * 1000;
        const checkInterval = 30000; // 30 seconds

        for (let elapsed = 0; elapsed < maxWait; elapsed += checkInterval) {
            const status = await this.getCIStatus(ref);

            if (status === 'success') {
                logger.info({ ref }, 'CI passed');
                return true;
            }

            if (status === 'failure') {
                logger.warn({ ref }, 'CI failed');
                return false;
            }

            logger.debug({ ref, elapsed: elapsed / 1000 }, 'Waiting for CI...');
            await this.sleep(checkInterval);
        }

        logger.warn({ ref, timeoutMinutes }, 'CI timeout');
        return false;
    }

    /**
     * Get priority from issue labels
     */
    getPriority(issue: Issue): Priority {
        if (issue.labels.includes('ai-priority:high')) return 'high';
        if (issue.labels.includes('ai-priority:medium')) return 'medium';
        if (issue.labels.includes('ai-priority:low')) return 'low';
        return 'none';
    }

    /**
     * Sort issues by priority
     */
    sortByPriority(issues: Issue[]): Issue[] {
        const priorityOrder: Record<Priority, number> = {
            high: 0,
            medium: 1,
            low: 2,
            none: 3,
        };

        return [...issues].sort((a, b) => {
            const priorityA = priorityOrder[this.getPriority(a)];
            const priorityB = priorityOrder[this.getPriority(b)];
            return priorityA - priorityB;
        });
    }

    /**
     * Check if an issue has new comments since a specific date
     */
    hasNewComments(issue: Issue, since: Date): boolean {
        return issue.comments.some((comment) => {
            const commentDate = new Date(comment.createdAt);
            return commentDate > since && comment.author !== this.username;
        });
    }

    /**
     * Get the latest comment from a non-bot user
     */
    getLatestHumanComment(issue: Issue): Comment | null {
        const humanComments = issue.comments.filter((c) => c.author !== this.username);
        return humanComments.length > 0 ? humanComments[humanComments.length - 1] : null;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
