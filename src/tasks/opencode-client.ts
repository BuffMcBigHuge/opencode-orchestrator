import fetch from 'node-fetch';
import EventSource from 'eventsource';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('opencode-client');

/**
 * OpenCode Session
 */
export interface OpenCodeSession {
    id: string;
    title?: string;
    parentID?: string;
    createdAt?: string;
    shareURL?: string;
}

/**
 * OpenCode Message
 */
export interface OpenCodeMessage {
    info: {
        id: string;
        sessionID: string;
        role: 'user' | 'assistant' | 'system';
        createdAt?: string;
    };
    parts: OpenCodePart[];
}

/**
 * OpenCode Message Part
 */
export interface OpenCodePart {
    type: string;
    text?: string;
    name?: string;
    [key: string]: any;
}

/**
 * OpenCode Event from SSE stream
 */
export interface OpenCodeEvent {
    type: string;
    sessionID?: string;
    messageID?: string;
    part?: any;
    error?: any;
    shareLink?: string;
    url?: string;
    cost?: number;
    [key: string]: any;
}

/**
 * Session status
 */
export interface SessionStatus {
    state: 'idle' | 'running' | 'blocked' | 'error';
    [key: string]: any;
}

/**
 * File diff
 */
export interface FileDiff {
    path: string;
    oldContent?: string;
    newContent?: string;
    diff?: string;
}

/**
 * OpenCode Server HTTP Client
 * 
 * Provides typed access to the OpenCode server API endpoints.
 */
export class OpenCodeServerClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'http://localhost:4096') {
        this.baseUrl = baseUrl;
        logger.debug({ baseUrl }, 'OpenCode server client initialized');
    }

    /**
     * Check server health
     */
    async checkHealth(): Promise<{ healthy: boolean; version?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/global/health`);
            if (!response.ok) {
                return { healthy: false };
            }
            const data = await response.json() as any;
            return { healthy: true, version: data.version };
        } catch (error) {
            logger.error({ error }, 'Health check failed');
            return { healthy: false };
        }
    }

    /**
     * Create a new session
     */
    async createSession(title?: string, parentID?: string, directory?: string): Promise<OpenCodeSession> {
        logger.info({ title, parentID, directory }, 'Creating session');

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (directory) {
            headers['x-opencode-directory'] = directory;
        }

        const response = await fetch(`${this.baseUrl}/session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title, parentID }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to create session: ${response.statusText} - ${error}`);
        }

        const session = await response.json() as OpenCodeSession;
        logger.info({ sessionId: session.id }, 'Session created');
        return session;
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId: string): Promise<OpenCodeSession> {
        const response = await fetch(`${this.baseUrl}/session/${sessionId}`);

        if (!response.ok) {
            throw new Error(`Failed to get session: ${response.statusText}`);
        }

        return await response.json() as OpenCodeSession;
    }

    /**
     * Get session status
     */
    async getSessionStatus(): Promise<Record<string, SessionStatus>> {
        const response = await fetch(`${this.baseUrl}/session/status`);

        if (!response.ok) {
            throw new Error(`Failed to get session status: ${response.statusText}`);
        }

        return await response.json() as Record<string, SessionStatus>;
    }

    /**
     * Delete a session
     */
    async deleteSession(sessionId: string): Promise<boolean> {
        logger.info({ sessionId }, 'Deleting session');

        const response = await fetch(`${this.baseUrl}/session/${sessionId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Failed to delete session: ${response.statusText}`);
        }

        return await response.json() as boolean;
    }

    /**
     * Send a message to a session (synchronous - waits for response)
     */
    async sendMessage(
        sessionId: string,
        parts: OpenCodePart[],
        options?: {
            messageID?: string;
            model?: string;
            agent?: string;
            noReply?: boolean;
            system?: string;
            tools?: any[];
        }
    ): Promise<OpenCodeMessage> {
        logger.info({ sessionId, partsCount: parts.length }, 'Sending message');

        const response = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts, ...options }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to send message: ${response.statusText} - ${error}`);
        }

        return await response.json() as OpenCodeMessage;
    }

    /**
     * Send a prompt asynchronously (returns immediately, response via events)
     * This is the equivalent of POST /session/:id/prompt_async
     */
    async sendPromptAsync(
        sessionId: string,
        parts: OpenCodePart[],
        options?: {
            messageID?: string;
            model?: string;
            agent?: string;
        }
    ): Promise<void> {
        logger.info({ sessionId, partsCount: parts.length }, 'Sending async prompt');

        const response = await fetch(`${this.baseUrl}/session/${sessionId}/prompt_async`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts, ...options }),
        });

        if (!response.ok && response.status !== 204) {
            const error = await response.text();
            throw new Error(`Failed to send async prompt: ${response.statusText} - ${error}`);
        }
    }

    /**
     * Get messages from a session
     */
    async getMessages(sessionId: string, limit?: number): Promise<OpenCodeMessage[]> {
        const url = limit
            ? `${this.baseUrl}/session/${sessionId}/message?limit=${limit}`
            : `${this.baseUrl}/session/${sessionId}/message`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to get messages: ${response.statusText}`);
        }

        return await response.json() as OpenCodeMessage[];
    }

    /**
     * Get a specific message
     */
    async getMessage(sessionId: string, messageId: string): Promise<OpenCodeMessage> {
        const response = await fetch(`${this.baseUrl}/session/${sessionId}/message/${messageId}`);

        if (!response.ok) {
            throw new Error(`Failed to get message: ${response.statusText}`);
        }

        return await response.json() as OpenCodeMessage;
    }

    /**
     * Abort a running session
     */
    async abortSession(sessionId: string): Promise<boolean> {
        logger.info({ sessionId }, 'Aborting session');

        const response = await fetch(`${this.baseUrl}/session/${sessionId}/abort`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(`Failed to abort session: ${response.statusText}`);
        }

        return await response.json() as boolean;
    }

    /**
     * Share a session (creates a public share link)
     */
    async shareSession(sessionId: string): Promise<OpenCodeSession> {
        logger.info({ sessionId }, 'Sharing session');

        const response = await fetch(`${this.baseUrl}/session/${sessionId}/share`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(`Failed to share session: ${response.statusText}`);
        }

        const session = await response.json() as OpenCodeSession;
        logger.info({ sessionId, shareURL: session.shareURL }, 'Session shared');
        return session;
    }

    /**
     * Get session diff (file changes)
     */
    async getSessionDiff(sessionId: string, messageId?: string): Promise<FileDiff[]> {
        const url = messageId
            ? `${this.baseUrl}/session/${sessionId}/diff?messageID=${messageId}`
            : `${this.baseUrl}/session/${sessionId}/diff`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to get diff: ${response.statusText}`);
        }

        return await response.json() as FileDiff[];
    }

    /**
     * Stream events from the server (SSE)
     * 
     * @param onEvent Callback for each event
     * @param onError Callback for errors
     * @param sessionId Optional session ID to filter events
     * @returns EventSource instance (call .close() to stop)
     */
    streamEvents(
        onEvent: (event: OpenCodeEvent) => void,
        onError?: (error: Error) => void,
        sessionId?: string
    ): EventSource {
        const eventUrl = `${this.baseUrl}/event`;
        logger.info({ sessionId, eventUrl }, 'Starting event stream');

        const eventSource = new EventSource(eventUrl);

        // Track connection attempts to detect rapid reconnection loops
        let connectionAttempts = 0;
        let lastConnectionTime = Date.now();

        eventSource.onopen = () => {
            connectionAttempts++;
            const now = Date.now();
            const timeSinceLastConnection = now - lastConnectionTime;
            lastConnectionTime = now;

            // Warn if reconnecting too frequently (< 1 second between connections)
            if (connectionAttempts > 1 && timeSinceLastConnection < 1000) {
                logger.warn({ 
                    sessionId, 
                    connectionAttempts,
                    timeSinceLastConnection,
                    eventUrl 
                }, 'EventSource reconnecting rapidly - possible connection issue');
                console.log(`\x1b[33m⚠️ EventSource rapid reconnection detected (${timeSinceLastConnection}ms since last)\x1b[0m`);
            }

            logger.info({ 
                sessionId, 
                connectionAttempts,
                eventUrl,
                readyState: eventSource.readyState 
            }, 'Event stream connection opened');
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as OpenCodeEvent;

                // Extract session ID from various possible locations
                const eventSessionId = data.sessionID ||
                    data.properties?.sessionID ||
                    data.properties?.part?.sessionID ||
                    data.properties?.message?.sessionID;

                // Filter by session ID if provided
                if (sessionId && eventSessionId && eventSessionId !== sessionId) {
                    logger.debug({ 
                        eventType: data.type, 
                        eventSessionId, 
                        filterSessionId: sessionId 
                    }, 'Event filtered out (different session)');
                    return;
                }

                logger.debug({ type: data.type, sessionId: data.sessionID }, 'Event received');
                onEvent(data);
            } catch (error) {
                logger.error({ error, data: event.data }, 'Failed to parse event');
                onError?.(error as Error);
            }
        };

        eventSource.onerror = (error: any) => {
            // Extract more details from EventSource error
            const errorDetails: any = {
                type: error?.type,
                message: error?.message || '',
                status: error?.status,
                statusText: error?.statusText,
                readyState: eventSource.readyState,
                // readyState values: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
                readyStateText: eventSource.readyState === 0 ? 'CONNECTING' : 
                               eventSource.readyState === 1 ? 'OPEN' : 'CLOSED',
                url: eventSource.url,
                // Full error object for debugging
                fullError: error
            };

            logger.error({ 
                sessionId, 
                errorDetails,
                // Log individual fields for easy filtering in logs
                readyState: errorDetails.readyState,
                readyStateText: errorDetails.readyStateText,
                errorType: error?.type,
                errorMessage: error?.message
            }, 'Event stream error');

            // Also log to console for immediate visibility
            console.log(`\x1b[31m❌ EventSource Error (readyState: ${errorDetails.readyStateText}):\x1b[0m`, {
                type: error?.type,
                message: error?.message || '(no message)',
                status: error?.status,
                url: eventSource.url
            });

            // Cast to Error if it looks like one, or create new Error with details
            const err = error instanceof Error ? error : new Error(
                `EventSource error: ${error?.type || 'unknown'} - ${error?.message || 'no details'}`
            );
            onError?.(err);
        };

        return eventSource;
    }

    /**
     * Get list of available agents
     */
    async getAgents(): Promise<any[]> {
        const response = await fetch(`${this.baseUrl}/agent`);

        if (!response.ok) {
            throw new Error(`Failed to get agents: ${response.statusText}`);
        }

        return await response.json() as any[];
    }

    /**
     * Get config info including providers and models
     */
    async getConfig(): Promise<any> {
        const response = await fetch(`${this.baseUrl}/config`);

        if (!response.ok) {
            throw new Error(`Failed to get config: ${response.statusText}`);
        }

        return await response.json() as any;
    }

    /**
     * Get providers and default models
     */
    async getProviders(): Promise<{ providers: any[]; default: Record<string, string> }> {
        const response = await fetch(`${this.baseUrl}/config/providers`);

        if (!response.ok) {
            throw new Error(`Failed to get providers: ${response.statusText}`);
        }

        return await response.json() as { providers: any[]; default: Record<string, string> };
    }

    /**
     * Get the base URL
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
}
