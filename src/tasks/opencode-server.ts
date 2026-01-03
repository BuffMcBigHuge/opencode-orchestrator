import { spawn, ChildProcess } from 'node:child_process';
import { Config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('opencode-server');

/**
 * Manages the OpenCode server process
 */
export class OpenCodeServerManager {
    private process: ChildProcess | null = null;
    private isRunning = false;
    private projectPath: string;
    private serverUrl: string;
    private port: number;

    constructor(private config: Config) {
        this.projectPath = config.opencode.projectPath;
        this.serverUrl = config.opencode.serverUrl;
        // Extract port from URL
        const url = new URL(this.serverUrl);
        this.port = parseInt(url.port || '4096', 10);
    }

    /**
     * Start the OpenCode server
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.info('OpenCode server already running');
            return;
        }

        // Check if server is already running externally
        if (await this.isHealthy()) {
            logger.info('OpenCode server already running externally');
            this.isRunning = true;
            return;
        }

        logger.info({ projectPath: this.projectPath, port: this.port }, 'Starting OpenCode server');

        this.process = spawn('opencode', ['serve', '--port', String(this.port)], {
            cwd: this.projectPath,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            env: {
                ...process.env,
                // Ensure OpenCode uses the correct project
            },
        });

        // Log stdout
        this.process.stdout?.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output) {
                logger.debug({ output }, 'OpenCode server stdout');
            }
        });

        // Log stderr
        this.process.stderr?.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output) {
                logger.warn({ output }, 'OpenCode server stderr');
            }
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
            logger.info({ code, signal }, 'OpenCode server exited');
            this.isRunning = false;
            this.process = null;
        });

        this.process.on('error', (error) => {
            logger.error({ error }, 'OpenCode server process error');
            this.isRunning = false;
        });

        // Wait for server to be healthy
        await this.waitForHealthy();
        this.isRunning = true;
        logger.info('OpenCode server started successfully');
    }

    /**
     * Check if the server is healthy
     */
    async isHealthy(): Promise<boolean> {
        try {
            const response = await fetch(`${this.serverUrl}/global/health`);
            if (response.ok) {
                const data = await response.json() as { healthy: boolean };
                return data.healthy === true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Wait for the server to become healthy
     */
    private async waitForHealthy(maxWaitMs = 30000, intervalMs = 500): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            if (await this.isHealthy()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        throw new Error('OpenCode server failed to become healthy within timeout');
    }

    /**
     * Stop the OpenCode server
     */
    async stop(): Promise<void> {
        if (!this.process) {
            logger.debug('No OpenCode server process to stop');
            return;
        }

        logger.info('Stopping OpenCode server');

        return new Promise((resolve) => {
            if (!this.process) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                logger.warn('OpenCode server did not exit gracefully, forcing kill');
                this.process?.kill('SIGKILL');
                resolve();
            }, 5000);

            this.process.once('exit', () => {
                clearTimeout(timeout);
                this.process = null;
                this.isRunning = false;
                resolve();
            });

            // Send SIGTERM for graceful shutdown
            this.process.kill('SIGTERM');
        });
    }

    /**
     * Get the server URL
     */
    getServerUrl(): string {
        return this.serverUrl;
    }

    /**
     * Check if we spawned this server (vs using external)
     */
    isOwnedProcess(): boolean {
        return this.process !== null;
    }
}
