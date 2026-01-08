import { Issue } from './client.js';
import { Config } from '../config.js';

/**
 * Labels used by the orchestrator
 */
export const Labels = {
    AI_TASK: 'ai-task',
    AI_IN_PROGRESS: 'ai-in-progress',
    AI_BLOCKED: 'ai-blocked',
    AI_REVIEW_READY: 'ai-review-ready',
    AI_DEBUGGING: 'ai-debugging',
    AI_APPROVED: 'ai-approved',
    PRIORITY_HIGH: 'ai-priority:high',
    PRIORITY_MEDIUM: 'ai-priority:medium',
    PRIORITY_LOW: 'ai-priority:low',
} as const;

/**
 * Label colors for GitHub
 */
export const LabelColors = {
    [Labels.AI_TASK]: '0e8a16', // Green
    [Labels.AI_IN_PROGRESS]: 'fbca04', // Yellow/Orange
    [Labels.AI_BLOCKED]: '7057ff', // Purple
    [Labels.AI_REVIEW_READY]: '1d76db', // Blue
    [Labels.AI_DEBUGGING]: 'd93f0b', // Red/Orange
    [Labels.AI_APPROVED]: '0e8a16', // Green (approved = trusted)
    [Labels.PRIORITY_HIGH]: 'b60205', // Red
    [Labels.PRIORITY_MEDIUM]: 'fbca04', // Yellow
    [Labels.PRIORITY_LOW]: '0052cc', // Blue
} as const;

/**
 * Check if issue is ready for pickup
 */
export function isReadyForPickup(issue: Issue): boolean {
    return (
        issue.labels.includes(Labels.AI_TASK) && !issue.labels.includes(Labels.AI_IN_PROGRESS)
    );
}

/**
 * Check if issue is currently in progress
 */
export function isInProgress(issue: Issue): boolean {
    return issue.labels.includes(Labels.AI_IN_PROGRESS);
}

/**
 * Check if issue is blocked
 */
export function isBlocked(issue: Issue): boolean {
    return issue.labels.includes(Labels.AI_BLOCKED);
}

/**
 * Check if issue is ready for review
 */
export function isReviewReady(issue: Issue): boolean {
    return issue.labels.includes(Labels.AI_REVIEW_READY);
}

/**
 * Check if issue needs debugging
 */
export function needsDebugging(issue: Issue): boolean {
    return issue.labels.includes(Labels.AI_DEBUGGING);
}

export function isUserAllowed(issue: Issue, config: Config): boolean {
    const allowedUsers = config.github.allowedUsers;
    
    if (allowedUsers.length === 0) {
        return true;
    }
    
    if (allowedUsers.includes(issue.author)) {
        return true;
    }
    
    if (issue.labels.includes(Labels.AI_APPROVED)) {
        return true;
    }
    
    return false;
}
