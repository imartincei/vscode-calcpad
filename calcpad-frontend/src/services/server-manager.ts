import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import type { ILogger } from '../types/interfaces';

/**
 * Manages the lifecycle of the bundled CalcPad server process.
 * Adapted from the VS Code extension's CalcpadServerManager with
 * vscode.OutputChannel replaced by ILogger interface.
 */
export class CalcpadServerManager {
    private serverProcess: ChildProcess | null = null;
    private port: number = 0;
    private logger: ILogger;
    private basePath: string;
    private dotnetPath: string;
    private _isRunning: boolean = false;
    private _disposed: boolean = false;

    constructor(basePath: string, logger: ILogger, dotnetPath: string = 'dotnet') {
        this.basePath = basePath;
        this.logger = logger;
        this.dotnetPath = dotnetPath;
    }

    /**
     * Check if the bundled server DLL exists.
     */
    public static dllExists(basePath: string): boolean {
        const dllPath = path.join(basePath, 'bin', 'CalcpadServer.dll');
        return fs.existsSync(dllPath);
    }

    /**
     * Start the bundled server. Allocates a free port, spawns the dotnet process,
     * and waits for the server to become ready.
     */
    public async start(): Promise<void> {
        if (this._isRunning) {
            this.log('Server is already running');
            return;
        }

        const dllPath = path.join(this.basePath, 'bin', 'CalcpadServer.dll');
        if (!fs.existsSync(dllPath)) {
            throw new Error(`CalcpadServer.dll not found at ${dllPath}`);
        }

        this.port = await this.findFreePort();
        this.log(`Starting server on port ${this.port}...`);

        const serverUrl = `http://localhost:${this.port}`;

        this.serverProcess = spawn(this.dotnetPath, [dllPath, '--urls', serverUrl], {
            env: { ...process.env },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.serverProcess.stdout?.on('data', (data: Buffer) => {
            this.log(`[stdout] ${data.toString().trim()}`);
        });

        this.serverProcess.stderr?.on('data', (data: Buffer) => {
            this.log(`[stderr] ${data.toString().trim()}`);
        });

        this.serverProcess.on('error', (err: Error) => {
            this.log(`[error] Failed to start server: ${err.message}`);
            this._isRunning = false;
        });

        this.serverProcess.on('exit', (code, signal) => {
            this.log(`[exit] Server process exited (code=${code}, signal=${signal})`);
            this._isRunning = false;
            this.serverProcess = null;

            // Auto-restart if not intentionally disposed
            if (!this._disposed && code !== 0) {
                this.log('Unexpected exit — attempting restart in 2 seconds...');
                setTimeout(() => {
                    if (!this._disposed) {
                        this.start().catch(err => {
                            this.log(`Restart failed: ${err instanceof Error ? err.message : String(err)}`);
                        });
                    }
                }, 2000);
            }
        });

        await this.waitForReady(serverUrl);
        this._isRunning = true;
        this.log(`Server is ready at ${serverUrl}`);
    }

    /**
     * Stop the server process gracefully.
     */
    public async stop(): Promise<void> {
        this._disposed = true;

        if (!this.serverProcess) {
            return;
        }

        this.log('Stopping server...');

        const proc = this.serverProcess;
        this.serverProcess = null;
        this._isRunning = false;

        // Try graceful shutdown first
        const isWindows = process.platform === 'win32';
        if (isWindows) {
            proc.kill();
        } else {
            proc.kill('SIGTERM');
        }

        // Force kill after timeout
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                try {
                    if (isWindows) {
                        proc.kill();
                    } else {
                        proc.kill('SIGKILL');
                    }
                } catch {
                    // Process may already be dead
                }
                resolve();
            }, 5000);

            proc.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        this.log('Server stopped');
    }

    /**
     * Get the base URL of the running server.
     */
    public getBaseUrl(): string {
        return `http://localhost:${this.port}`;
    }

    public get isRunning(): boolean {
        return this._isRunning;
    }

    public dispose(): void {
        this.stop();
    }

    private async findFreePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address !== 'string') {
                    const port = address.port;
                    server.close(() => resolve(port));
                } else {
                    server.close(() => reject(new Error('Could not allocate port')));
                }
            });
            server.on('error', reject);
        });
    }

    private async waitForReady(serverUrl: string, maxAttempts: number = 60, intervalMs: number = 500): Promise<void> {
        const healthUrl = `${serverUrl}/api/calcpad/snippets`;

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await fetch(healthUrl);
                if (response.ok) {
                    return;
                }
            } catch {
                // Server not ready yet
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }

        throw new Error(`Server did not become ready within ${maxAttempts * intervalMs / 1000} seconds`);
    }

    private log(message: string): void {
        this.logger.appendLine(`[ServerManager] ${message}`);
    }
}
