import { pino } from 'pino';
import { loadConfig } from '../config.js';

const config = loadConfig();

/**
 * Get status icon for todo items
 */
function getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
        case 'completed':
        case 'done':
            return '\x1b[32m✓\x1b[0m'; // Green checkmark
        case 'in_progress':
        case 'working':
            return '\x1b[33m→\x1b[0m'; // Yellow arrow
        case 'pending':
        case 'todo':
        default:
            return '\x1b[90m○\x1b[0m'; // Gray circle
    }
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
}

/**
 * Create a pino logger with pretty printing in development
 * Using simpler options that work with pino-pretty transport
 */
export const logger = pino({
    level: config.logging.level,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            // Keep logs more compact by not expanding objects on separate lines
            singleLine: true,
        },
    },
});

/**
 * Create a child logger for a specific component
 */
export function createLogger(component: string) {
    return logger.child({ component });
}

/**
 * Format a todo list for console output
 * Use this for custom console.log formatting
 */
export function formatTodoList(todos: any[]): string {
    if (!todos || todos.length === 0) return '  (no todos)';

    const lines: string[] = [];
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';

    for (const todo of todos) {
        const status = todo.status || 'pending';
        const icon = getStatusIcon(status);
        const priority = todo.priority ? `${dim}[${todo.priority}]${reset}` : '';
        const content = truncate(todo.content || '', 70);
        lines.push(`  ${icon} ${content} ${priority}`);
    }

    return lines.join('\n');
}

/**
 * Format error for console output
 */
export function formatError(error: any): string {
    const red = '\x1b[31m';
    const reset = '\x1b[0m';

    if (typeof error === 'string') {
        return `${red}✗ Error: ${error}${reset}`;
    }

    const name = error.name || 'Error';
    const message = error.message || error.data?.message || JSON.stringify(error);
    const truncatedMsg = truncate(message, 200);

    return `${red}✗ ${name}: ${truncatedMsg}${reset}`;
}

/**
 * Create a compact log line for events
 * Use this for streaming events to console
 */
export function formatEventLine(eventType: string, issueNumber?: number, details?: string): string {
    const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const dim = '\x1b[2m';
    const reset = '\x1b[0m';
    const cyan = '\x1b[36m';
    const bold = '\x1b[1m';

    let line = `${dim}${timestamp}${reset} ${cyan}EVENT${reset}`;

    if (issueNumber !== undefined) {
        line += ` ${bold}#${issueNumber}${reset}`;
    }

    line += ` ${eventType}`;

    if (details) {
        line += ` ${dim}${details}${reset}`;
    }

    return line;
}
