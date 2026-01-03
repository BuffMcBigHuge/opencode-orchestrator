import { Config } from '../config.js';
import { createLogger, formatTodoList } from '../utils/logger.js';
import { generateOrchestratorPrompt, generateContinuationPrompt } from '../prompts/orchestrator.js';
import { Issue, GitHubClient } from '../github/client.js';
import { Labels } from '../github/labels.js';
import { OpenCodeServerClient, OpenCodeEvent } from './opencode-client.js';
import EventSource from 'eventsource';

const logger = createLogger('opencode');

/**
 * Sanitize event data to remove large content (like file diffs) for logging
 * This prevents massive walls of text in the console
 */
function sanitizeEventForLogging(event: any): any {
    if (!event || typeof event !== 'object') return event;

    // Recursively sanitize nested objects
    const sanitizeObject = (obj: any, depth = 0): any => {
        if (depth > 5 || !obj || typeof obj !== 'object') return obj;

        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map(item => sanitizeObject(item, depth + 1));
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            // Replace large string content with summary
            if (typeof value === 'string' && value.length > 200) {
                // Check if it looks like code/file content
                if (value.includes('\n') || key === 'before' || key === 'after' || key === 'text' || key === 'content') {
                    const lines = value.split('\n').length;
                    result[key] = `[${lines} lines, ${value.length} chars]`;
                    continue;
                }
                result[key] = value.substring(0, 100) + '...[truncated]';
                continue;
            }

            // Handle FileDiff objects - show compact summary
            if (key === 'diffs' && Array.isArray(value)) {
                result[key] = value.map((diff: any) => ({
                    file: diff.file,
                    additions: diff.additions,
                    deletions: diff.deletions,
                    // Omit before/after content
                }));
                continue;
            }

            // Recursively handle nested objects
            if (typeof value === 'object' && value !== null) {
                result[key] = sanitizeObject(value, depth + 1);
            } else {
                result[key] = value;
            }
        }
        return result;
    };

    return sanitizeObject({ ...event });
}

/**
 * Format a file diff for compact console output
 */
function formatFileDiffSummary(diffs: any[]): string {
    if (!diffs || diffs.length === 0) return '';

    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';

    const lines: string[] = [];
    for (const diff of diffs) {
        const file = diff.file || 'unknown';
        const adds = diff.additions || 0;
        const dels = diff.deletions || 0;
        lines.push(`  ${dim}${file}${reset} ${green}+${adds}${reset} ${red}-${dels}${reset}`);
    }
    return lines.join('\n');
}

export interface OpenCodeTaskStatus {
    sessionId: string;
    issueNumber: number;
    startedAt: Date;
    shareLink?: string;
    eventSource?: EventSource;
    lastActivity: Date;
    currentMessageBuffer?: string;
    statusCheckInterval?: NodeJS.Timeout;
    lastTuiPopup?: {
        title: string;
        message: string;
        variant?: string;
    };
    errorHandled?: boolean; // Flag to prevent duplicate error handling
}

/**
 * OpenCode process manager (Server API version)
 */
export class OpenCodeManager {
    private tasks: Map<number, OpenCodeTaskStatus> = new Map();
    private client: OpenCodeServerClient;
    private github: GitHubClient;
    private onTaskComplete?: (issueNumber: number) => void;

    constructor(private config: Config, onTaskComplete?: (issueNumber: number) => void) {
        this.client = new OpenCodeServerClient(config.opencode.serverUrl);
        this.github = new GitHubClient(config);
        this.onTaskComplete = onTaskComplete;
    }

    /**
     * Check agent and model configuration for potential issues
     */
    async checkConfiguration(): Promise<void> {
        try {
            const agents = await this.client.getAgents();
            const providers = await this.client.getProviders();

            logger.info({
                agentCount: agents.length,
                providerCount: providers.providers.length,
                agents: agents.map(a => ({ name: a.name, model: a.model })),
                defaultModels: providers.default
            }, 'OpenCode configuration check');

            // Check for agents with potentially invalid models
            for (const agent of agents) {
                if (agent.model) {
                    let providerID: string | undefined;
                    let modelID: string | undefined;

                    // Handle both object and string model formats
                    if (typeof agent.model === 'object') {
                        providerID = agent.model.providerID || agent.model.provider;
                        modelID = agent.model.modelID || agent.model.model;
                    } else {
                        // If it's a string, try to parse it (format: "provider/model" or just "model")
                        const parts = String(agent.model).split('/');
                        if (parts.length === 2) {
                            providerID = parts[0];
                            modelID = parts[1];
                        } else {
                            modelID = parts[0];
                        }
                    }

                    // Check for empty modelID (this is likely the issue!)
                    if (!modelID || modelID.trim() === '') {
                        logger.warn({
                            agentName: agent.name,
                            providerID,
                            modelID: modelID || '(empty)',
                            fullModel: agent.model
                        }, 'Agent configured with empty modelID - this will cause validation failures');
                        console.log(`\n\x1b[33m⚠️ Config Error: Agent "${agent.name}" has empty modelID!\x1b[0m`);
                        continue;
                    }

                    // Check if provider exists
                    const provider = providers.providers.find(p =>
                        p.id === providerID || p.name === providerID
                    );

                    if (!provider) {
                        logger.warn({
                            agentName: agent.name,
                            providerID,
                            modelID,
                            availableProviders: providers.providers.map(p => ({ id: p.id, name: p.name }))
                        }, 'Agent configured with provider that may not exist');
                        console.log(`\x1b[33m⚠️ Config Warning: Agent "${agent.name}" uses unknown provider "${providerID}"\x1b[0m`);
                        continue;
                    }
                }
            }
        } catch (error: any) {
            logger.error({
                error: error.message || error,
                errorStack: error.stack,
                errorType: error.constructor?.name
            }, 'Failed to check OpenCode configuration');
            // Don't throw - this is a diagnostic check, not critical
        }
    }

    /**
     * Start OpenCode for a new task
     */
    async startTask(
        issue: Issue,
        worktreePath: string,
        branchName: string
    ): Promise<OpenCodeTaskStatus> {
        const prompt = generateOrchestratorPrompt(this.config, issue, worktreePath, branchName);

        // Create session with the worktree directory so OpenCode uses correct project context
        // We use the issue title as the session title for visibility
        const title = `Issue #${issue.number}: ${issue.title.substring(0, 50)}`;
        const session = await this.client.createSession(title, undefined, worktreePath);

        logger.info({ issueNumber: issue.number, sessionId: session.id }, 'Created OpenCode session');

        // Check configuration before sending prompt
        await this.checkConfiguration();

        try {
            await this.client.sendPromptAsync(session.id, [{
                type: 'text',
                text: prompt
            }]);
        } catch (error: any) {
            logger.error({
                issueNumber: issue.number,
                sessionId: session.id,
                error: error.message || error,
                errorStack: error.stack
            }, 'Failed to send prompt - may indicate model/config issue');
            console.log(`\x1b[31m❌ Failed to send prompt: ${error.message || error}\x1b[0m`);
            throw error; // Re-throw so caller can handle
        }

        // Track task
        const task: OpenCodeTaskStatus = {
            sessionId: session.id,
            issueNumber: issue.number,
            startedAt: new Date(),
            lastActivity: new Date()
        };

        this.tasks.set(issue.number, task);

        // Start listening to events
        this.subscribeToEvents(task);

        return task;
    }

    /**
     * Continue a blocked task after human reply
     */
    async continueTask(
        issue: Issue,
        worktreePath: string,
        previousSessionId: string,
        newComment: string
    ): Promise<OpenCodeTaskStatus> {
        const prompt = generateContinuationPrompt(
            this.config,
            issue,
            worktreePath,
            previousSessionId,
            newComment
        );

        logger.info({ issueNumber: issue.number, sessionId: previousSessionId }, 'Continuing task');

        // Verify session exists
        try {
            await this.client.getSession(previousSessionId);
        } catch (error) {
            logger.error({ issueNumber: issue.number, sessionId: previousSessionId, error }, 'Previous session not found, creating new one');
            // Fallback: Start fresh if session is lost, though context will be missing
            // Ideally we should try to recover or notify user
            return this.startTask(issue, worktreePath, `ai/issue-${issue.number}-recovery`);
        }

        // Send continuation prompt
        try {
            await this.client.sendPromptAsync(previousSessionId, [{
                type: 'text',
                text: prompt
            }]);
        } catch (error: any) {
            logger.error({
                issueNumber: issue.number,
                sessionId: previousSessionId,
                error: error.message || error,
                errorStack: error.stack
            }, 'Failed to send continuation prompt - may indicate model/config issue');
            throw error; // Re-throw so caller can handle
        }

        // Track task
        const task: OpenCodeTaskStatus = {
            sessionId: previousSessionId,
            issueNumber: issue.number,
            startedAt: new Date(), // Restarting "activity"
            lastActivity: new Date()
        };

        this.tasks.set(issue.number, task);

        // Start listening to events
        this.subscribeToEvents(task);

        return task;
    }

    /**
     * Subscribe to session events
     */
    private subscribeToEvents(task: OpenCodeTaskStatus): void {
        if (task.eventSource) {
            task.eventSource.close();
        }

        // We subscribe to the global event stream and filter by session ID
        // Alternatively, if the server supported per-session streams we'd use that
        // The client.streamEvents implementation handles filtering

        task.eventSource = this.client.streamEvents(
            (event: OpenCodeEvent) => {
                this.handleEvent(task, event);
            },
            (error: Error) => {
                logger.error({ issueNumber: task.issueNumber, error }, 'Event stream error');
                // Don't kill the task on stream error, rely on retry or eventual completion
            },
            task.sessionId
        );

        // Start periodic status checks to catch errors that might not come through events
        // Check every 10 seconds
        task.statusCheckInterval = setInterval(async () => {
            await this.checkSessionStatus(task);
        }, 10000);
    }

    /**
     * Periodically check session status to detect errors
     */
    private async checkSessionStatus(task: OpenCodeTaskStatus): Promise<void> {
        try {
            const statuses = await this.client.getSessionStatus();
            const sessionStatus = statuses[task.sessionId];

            if (sessionStatus) {
                // Log status changes
                if (sessionStatus.state === 'error' || sessionStatus.state === 'blocked') {
                    logger.warn({
                        issueNumber: task.issueNumber,
                        sessionId: task.sessionId,
                        state: sessionStatus.state,
                        fullStatus: sessionStatus
                    }, 'Session status check detected error/blocked state');
                    console.log(`\n⚠️ Session Status Check [${sessionStatus.state}]:`, sessionStatus);
                }

                // Check if session has been idle for too long without activity
                const timeSinceLastActivity = Date.now() - task.lastActivity.getTime();
                const IDLE_THRESHOLD_MS = 300000; // 5 minutes

                if (sessionStatus.state === 'idle' && timeSinceLastActivity > IDLE_THRESHOLD_MS) {
                    logger.warn({
                        issueNumber: task.issueNumber,
                        sessionId: task.sessionId,
                        timeSinceLastActivity,
                        state: sessionStatus.state
                    }, 'Session has been idle for extended period - may be stuck');
                }
            }
        } catch (error) {
            logger.error({ issueNumber: task.issueNumber, error }, 'Failed to check session status');
        }
    }

    /**
     * Handle incoming OpenCode events
     */
    private handleEvent(task: OpenCodeTaskStatus, event: OpenCodeEvent): void {
        task.lastActivity = new Date();
        const { issueNumber } = task;

        // Log based on event type
        const eventType = event.type;

        // First, log ALL events at debug level (with large content filtered)
        logger.debug({
            issueNumber,
            eventType,
            sessionId: event.sessionID,
            event: sanitizeEventForLogging(event)
        }, 'OpenCode event received');

        // Handle message.updated events - these contain model configuration info
        if (eventType === 'message.updated') {
            const messageInfo = event.properties?.info || event.info;
            if (messageInfo?.model) {
                const model = messageInfo.model;
                const providerID = model.providerID || model.provider || 'unknown';
                const modelID = model.modelID || model.model || '';

                // Check for empty modelID - this is the root cause!
                if (!modelID || modelID.trim() === '') {
                    logger.error({
                        issueNumber,
                        sessionId: task.sessionId,
                        agent: messageInfo.agent,
                        providerID,
                        modelID: '(empty)',
                        fullModel: model
                    }, 'CRITICAL: Message has empty modelID - this will cause session to fail');
                    console.log(`\n\x1b[31m❌ CRITICAL: Empty modelID for agent "${messageInfo.agent || 'unknown'}" - this will cause failures!\x1b[0m`);
                } else {
                    logger.debug({
                        issueNumber,
                        agent: messageInfo.agent,
                        providerID,
                        modelID
                    }, 'Message model configuration');
                }
            }

            // Handle message summaries with file diffs - show compact summary
            const summary = event.properties?.summary || event.summary;
            if (summary?.diffs && Array.isArray(summary.diffs) && summary.diffs.length > 0) {
                const totalAdds = summary.additions || summary.diffs.reduce((sum: number, d: any) => sum + (d.additions || 0), 0);
                const totalDels = summary.deletions || summary.diffs.reduce((sum: number, d: any) => sum + (d.deletions || 0), 0);
                const fileCount = summary.files || summary.diffs.length;

                console.log(`\n\x1b[36m📝 File Changes (#${issueNumber}): ${fileCount} files, \x1b[32m+${totalAdds}\x1b[0m \x1b[31m-${totalDels}\x1b[0m`);
                console.log(formatFileDiffSummary(summary.diffs));
            }
        }

        if (eventType === 'message.part.updated' || eventType === 'message.chunk') {
            const part = event.properties?.part || event.part;

            if (part?.type === 'text' && part.text) {
                if (eventType === 'message.chunk') {
                    // Chunks are usually deltas, so we append
                    const delta = part.text;
                    task.currentMessageBuffer = (task.currentMessageBuffer || '') + delta;
                    process.stdout.write(delta); // Stream to stdout for immediate feedback
                } else {
                    // Part updates are usually snapshots (the full text), so we replace
                    // Calculate delta for logging/streaming
                    const currentLength = task.currentMessageBuffer?.length || 0;
                    if (part.text.length > currentLength) {
                        const delta = part.text.substring(currentLength);
                        process.stdout.write(delta); // Stream to stdout for immediate feedback
                    }
                    task.currentMessageBuffer = part.text;
                }
            } else if (part?.type === 'tool_use' || part?.type === 'tool_call') {
                const toolName = part.name || part.tool || 'unknown';
                logger.info({ issueNumber, tool: toolName }, 'OpenCode tool use');
            } else if (part?.type === 'step_finish') {
                const cost = part.cost;

                // Log the buffered message if any
                if (task.currentMessageBuffer) {
                    logger.info({ issueNumber, text: task.currentMessageBuffer }, 'OpenCode message');
                    task.currentMessageBuffer = undefined;
                }

                logger.info({ issueNumber, cost }, 'OpenCode step finish');
            }
        } else if (eventType === 'error') {
            const errorData = event.error || event.properties?.error || event;
            logger.error({
                issueNumber,
                error: errorData,
                fullEvent: event
            }, 'OpenCode error event');
            // Also console.log for immediate visibility
            console.log(`\x1b[31m❌ OpenCode Error: ${typeof errorData === 'object' ? JSON.stringify(errorData) : errorData}\x1b[0m`);
        } else if (eventType.startsWith('tui.')) {
            // Log all TUI popup events (toast, dialog, modal, etc.)
            const popupData = event.properties || event;
            const title = popupData.title || popupData.message || '';
            const message = popupData.message || popupData.text || popupData.body || '';

            // Normalize message to ignore animation differences (bullet characters, etc.)
            const normalizeMessage = (text: string): string => {
                return text
                    .replace(/^[·•▪▫▪▫\s]+/, '') // Remove leading bullet/animation characters
                    .replace(/[·•▪▫▪▫\s]+$/, '') // Remove trailing bullet/animation characters
                    .trim();
            };

            const normalizedTitle = normalizeMessage(title);
            const normalizedMessage = normalizeMessage(message);

            // Always log to logger for debugging
            /*
            logger.info({
                issueNumber,
                popupType: eventType,
                title,
                message,
                variant: popupData.variant,
                duration: popupData.duration,
                fullEvent: event
            }, 'OpenCode TUI popup detected'); */

            // Only console.log if the message actually changed (ignore animation-only changes)
            const lastPopup = task.lastTuiPopup;
            const hasChanged = !lastPopup ||
                lastPopup.message !== normalizedMessage;

            if (hasChanged) {
                // Get color code based on variant
                const getVariantColor = (variant?: string): string => {
                    switch (variant?.toLowerCase()) {
                        case 'success':
                            return '\x1b[32m'; // Green
                        case 'warning':
                            return '\x1b[33m'; // Yellow
                        case 'error':
                            return '\x1b[31m'; // Red
                        case 'info':
                        default:
                            return '\x1b[36m'; // Cyan
                    }
                };

                const resetColor = '\x1b[0m';
                const color = getVariantColor(popupData.variant);

                // Format: {title} {message} with color
                const displayTitle = normalizedTitle ? `${normalizedTitle} ` : '';
                const displayMessage = normalizedMessage || '';
                const output = `${displayTitle}${displayMessage}`.trim();

                console.log(`${color}${output}${resetColor}`);

                // Save normalized version for comparison
                task.lastTuiPopup = {
                    title: normalizedTitle,
                    message: normalizedMessage,
                    variant: popupData.variant
                };
            }
        } else if (eventType === 'session.idle') {
            const idleSessionId = event.sessionID || event.properties?.sessionID;
            if (idleSessionId === task.sessionId) {
                // Check if session went idle too quickly (may indicate incomplete work or model error)
                const sessionDuration = Date.now() - task.startedAt.getTime();
                const MIN_SESSION_DURATION_MS = 60000; // 1 minute minimum
                const IMMEDIATE_FAILURE_MS = 1000; // Less than 1 second = likely model/config error

                if (sessionDuration < IMMEDIATE_FAILURE_MS) {
                    logger.error({
                        issueNumber,
                        sessionId: task.sessionId,
                        durationMs: sessionDuration,
                        event: event,
                        likelyCause: 'Model validation failure or configuration error'
                    }, 'Session failed immediately - likely model/config issue');
                    console.log(`\x1b[31m❌ Session failed immediately (${sessionDuration}ms) - likely config error\x1b[0m`);
                } else if (sessionDuration < MIN_SESSION_DURATION_MS) {
                    logger.warn({
                        issueNumber,
                        sessionId: task.sessionId,
                        durationMs: sessionDuration,
                        event: event // Log full event to debug specific error reasons (rate limits etc)
                    }, 'Session went idle very quickly - may not have completed work');
                }

                // Check for explicit error in idle event
                if (event.error && !task.errorHandled) {
                    task.errorHandled = true;
                    logger.error({
                        issueNumber,
                        sessionId: task.sessionId,
                        error: event.error
                    }, 'OpenCode session idle with error');

                    // Revert issue back to ai-task so it can be retried
                    this.handleSessionError(issueNumber, event.error, task.shareLink).catch((err) => {
                        logger.error({ issueNumber, error: err }, 'Failed to handle session error');
                    });
                }

                // Check message.updated events for model info - if we saw a model with empty modelID, that's the issue
                // This is a heuristic check based on what we saw in the logs
                const hasEmptyModelID = task.currentMessageBuffer?.includes('glm-4.7-free') || false;
                if (hasEmptyModelID && sessionDuration < IMMEDIATE_FAILURE_MS) {
                    console.log(`\x1b[31m❌ Model config error: glm-4.7-free provider has empty modelID\x1b[0m`);
                }

                // Log any remaining buffer
                if (task.currentMessageBuffer) {
                    logger.info({ issueNumber, text: task.currentMessageBuffer }, 'OpenCode final message');
                    task.currentMessageBuffer = undefined;
                }

                // Handle immediate failures that might not have triggered error events
                if (sessionDuration < IMMEDIATE_FAILURE_MS && !task.errorHandled) {
                    task.errorHandled = true;
                    const immediateError = {
                        name: 'ImmediateFailure',
                        message: `Session failed immediately after ${sessionDuration}ms - likely model/config validation error`
                    };
                    this.handleSessionError(issueNumber, immediateError, task.shareLink).catch((err) => {
                        logger.error({ issueNumber, error: err }, 'Failed to handle immediate failure error');
                    });
                }

                if (event.error || sessionDuration < IMMEDIATE_FAILURE_MS) {
                    logger.info({ issueNumber, sessionId: task.sessionId }, 'OpenCode session ended (Failed)');
                } else {
                    logger.info({ issueNumber, sessionId: task.sessionId }, 'OpenCode session idle - Task Complete');
                }

                // Cleanup task
                if (task.eventSource) {
                    task.eventSource.close();
                }
                if (task.statusCheckInterval) {
                    clearInterval(task.statusCheckInterval);
                }
                this.tasks.delete(issueNumber);

                // Notify TaskManager that this task is complete so it can free the slot
                if (this.onTaskComplete) {
                    this.onTaskComplete(issueNumber);
                }
            }
        } else if (eventType === 'session.status' || eventType === 'session.error' || eventType === 'session.blocked') {
            // Handle session status changes that might indicate errors
            const statusData = event.properties || event;
            const state = statusData.state || statusData.status;
            const error = statusData.error || event.error;

            if (error || state === 'error' || state === 'error' || state === 'blocked') {
                // Only handle error once per task
                if (!task.errorHandled) {
                    task.errorHandled = true;

                    logger.error({
                        issueNumber,
                        sessionId: event.sessionID || task.sessionId,
                        state,
                        error,
                        fullEvent: event
                    }, 'OpenCode session error/blocked detected');
                    console.log(`\x1b[33m⚠️ Session ${eventType}: state=${state}${error ? ', error=' + (error.message || error.name || 'unknown') : ''}\x1b[0m`);

                    // Revert issue back to ai-task so it can be retried
                    this.handleSessionError(issueNumber, error, task.shareLink).catch((err) => {
                        logger.error({ issueNumber, error: err }, 'Failed to handle session error');
                    });
                }
            }
        } else if (eventType === 'todo.updated') {
            // Handle todo updates - log them in a compact, readable format
            const todos = event.properties?.todos || event.todos || [];

            // Count by status
            const completed = todos.filter((t: any) => t.status === 'completed' || t.status === 'done');
            const inProgress = todos.filter((t: any) => t.status === 'in_progress' || t.status === 'working');
            const pending = todos.filter((t: any) => t.status === 'pending' || t.status === 'todo');

            // Log compact summary
            logger.info({
                issueNumber,
                todoCount: todos.length,
                completed: completed.length,
                inProgress: inProgress.length,
                pending: pending.length
            }, 'Todo list updated');

            // Print formatted todo list to console for easy reading
            console.log(`\n📋 Todo List (#${issueNumber}) - ${completed.length}/${todos.length} completed:`);
            console.log(formatTodoList(todos));
        } else {
            // Check for share links
            const shareLink = event.shareLink || event.url || event.properties?.shareLink || event.properties?.url;
            if (shareLink && typeof shareLink === 'string' && shareLink.includes('opncd.ai') && !task.shareLink) {
                task.shareLink = shareLink;
                logger.info({ issueNumber, shareLink }, 'OpenCode Share Link Captured');
            }

            // Log any unhandled event types that might contain important information
            // Look for keywords that suggest errors or model issues
            // Skip message.updated since we handle it specifically above
            if (eventType !== 'message.updated') {
                const eventStr = JSON.stringify(event).toLowerCase();
                if (eventStr.includes('model') ||
                    eventStr.includes('invalid') ||
                    eventStr.includes('error') ||
                    eventStr.includes('fail') ||
                    eventStr.includes('not valid') ||
                    eventStr.includes('token')) {
                    logger.warn({
                        issueNumber,
                        eventType,
                        fullEvent: event
                    }, 'Unhandled event with potential error/model information');
                    console.log(`\x1b[33m⚠️ Event [${eventType}] may contain error info\x1b[0m`);
                }
            }
        }
    }

    /**
     * Check if a task is currently running
     */
    isRunning(issueNumber: number): boolean {
        return this.tasks.has(issueNumber);
    }

    /**
     * Get a running task
     */
    getTask(issueNumber: number): OpenCodeTaskStatus | undefined {
        return this.tasks.get(issueNumber);
    }

    /**
     * Get task share link
     */
    async getShareLink(issueNumber: number): Promise<string | undefined> {
        const task = this.tasks.get(issueNumber);
        if (!task) return undefined;

        if (task.shareLink) return task.shareLink;

        // Try to fetch it explicitly
        try {
            const session = await this.client.shareSession(task.sessionId);
            if (session.shareURL) {
                task.shareLink = session.shareURL;
                return session.shareURL;
            }
        } catch (error) {
            logger.warn({ issueNumber, error }, 'Failed to fetch share link');
        }
        return undefined;
    }

    /**
     * Handle session errors by reverting issue back to ai-task label
     */
    private async handleSessionError(
        issueNumber: number,
        error: any,
        shareLink?: string
    ): Promise<void> {
        try {
            logger.info({ issueNumber }, 'Reverting issue to ai-task label after session error');

            // Remove ai-in-progress label
            try {
                await this.github.removeLabel(issueNumber, Labels.AI_IN_PROGRESS);
            } catch (err) {
                logger.warn({ issueNumber, error: err }, 'Failed to remove ai-in-progress label');
            }

            // Add ai-task label back so it can be retried
            try {
                await this.github.addLabel(issueNumber, Labels.AI_TASK);
            } catch (err) {
                logger.warn({ issueNumber, error: err }, 'Failed to add ai-task label');
            }

            // Post error comment
            const errorMessage = error?.data?.message || error?.message || JSON.stringify(error);
            const errorName = error?.name || 'UnknownError';
            const sessionLink = shareLink ? `\n\n### Session Log\n📎 [View session for debugging](${shareLink})` : '';

            const commentBody = `## ⚠️ Session Error - Issue Reset

The AI session encountered an error and the issue has been reset to \`ai-task\` status so it can be retried.

### Error Details
**Type:** ${errorName}

\`\`\`
${errorMessage.substring(0, 1000)}${errorMessage.length > 1000 ? '...' : ''}
\`\`\`

### What Happened
The session encountered an error during execution. The issue has been automatically reset to \`ai-task\` status and will be picked up again in the next polling cycle.

### Next Steps
- The orchestrator will automatically retry this issue
- If errors persist, please check the session logs and investigate the root cause
${sessionLink}

---
_This issue will be automatically retried. If problems continue, please investigate the error details above._`;

            await this.github.postComment(issueNumber, commentBody);
            logger.info({ issueNumber }, 'Posted error comment and reverted labels');
        } catch (err) {
            logger.error({ issueNumber, error: err }, 'Failed to handle session error');
            // Don't throw - we don't want error handling to crash the event handler
        }
    }

    /**
     * Kill a running task
     */
    async killTask(issueNumber: number): Promise<void> {
        const task = this.tasks.get(issueNumber);
        if (task) {
            logger.info({ issueNumber, sessionId: task.sessionId }, 'Stopping OpenCode task');

            // Close event stream
            if (task.eventSource) {
                task.eventSource.close();
            }

            // Clear status check interval
            if (task.statusCheckInterval) {
                clearInterval(task.statusCheckInterval);
            }

            // Abort session on server
            try {
                await this.client.abortSession(task.sessionId);
            } catch (error) {
                logger.error({ issueNumber, error }, 'Failed to abort session on server');
            }

            this.tasks.delete(issueNumber);
        }
    }

    /**
     * Kill all running tasks
     */
    async killAll(): Promise<void> {
        const promises = Array.from(this.tasks.keys()).map(id => this.killTask(id));
        await Promise.all(promises);
    }
}
