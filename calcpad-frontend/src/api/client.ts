import type { ILogger } from '../types/interfaces';
import type {
    LintRequest,
    LintResponse,
    ClientFileCache,
    HighlightRequest,
    HighlightResponse,
    HighlightToken,
    DefinitionsRequest,
    DefinitionsResponse,
} from '../types/api';
import type { SnippetsResponse } from '../types/snippets';

/**
 * Unified fetch-based API client for the CalcPad server.
 * Replaces scattered axios calls across the extension codebase.
 * Works in Node.js 18+, Electron, and browsers.
 */
export class CalcpadApiClient {
    private baseUrl: string;
    private logger?: ILogger;

    constructor(baseUrl: string, logger?: ILogger) {
        this.baseUrl = baseUrl;
        this.logger = logger;
    }

    public setBaseUrl(url: string): void {
        this.baseUrl = url;
    }

    public getBaseUrl(): string {
        return this.baseUrl;
    }

    public async lint(content: string, clientFileCache?: ClientFileCache): Promise<LintResponse | null> {
        const request: LintRequest = { content, clientFileCache };
        return this.post<LintResponse>('/api/calcpad/lint', request, 'Lint');
    }

    public async highlight(content: string, includeText: boolean = false): Promise<HighlightToken[] | null> {
        const request: HighlightRequest = { content, includeText };
        const response = await this.post<HighlightResponse>('/api/calcpad/highlight', request, 'Highlight');
        return response?.tokens ?? null;
    }

    public async definitions(content: string, clientFileCache?: ClientFileCache): Promise<DefinitionsResponse | null> {
        const request: DefinitionsRequest = { content, clientFileCache };
        return this.post<DefinitionsResponse>('/api/calcpad/definitions', request, 'Definitions');
    }

    public async snippets(): Promise<SnippetsResponse | null> {
        return this.get<SnippetsResponse>('/api/calcpad/snippets', 'Snippets');
    }

    public async convert(
        content: string,
        settings: unknown,
        outputFormat: string = 'html'
    ): Promise<ArrayBuffer | string | null> {
        const url = this.baseUrl + '/api/calcpad/convert';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, settings, outputFormat }),
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) return null;

            if (outputFormat === 'pdf') {
                return response.arrayBuffer();
            }
            return response.text();
        } catch (error) {
            this.logError('Convert', error);
            return null;
        }
    }

    public async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(this.baseUrl + '/api/calcpad/snippets', {
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    private async post<T>(endpoint: string, body: unknown, tag: string): Promise<T | null> {
        const url = this.baseUrl + endpoint;
        try {
            this.logger?.appendLine(`[${tag}] Sending request to server...`);
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000),
            });
            if (!response.ok) {
                this.logger?.appendLine(`[${tag}] Server returned ${response.status}`);
                return null;
            }
            const data: T = await response.json();
            return data;
        } catch (error) {
            this.logError(tag, error);
            return null;
        }
    }

    private async get<T>(endpoint: string, tag: string): Promise<T | null> {
        const url = this.baseUrl + endpoint;
        try {
            this.logger?.appendLine(`[${tag}] Sending request to server...`);
            const response = await fetch(url, {
                signal: AbortSignal.timeout(30000),
            });
            if (!response.ok) {
                this.logger?.appendLine(`[${tag}] Server returned ${response.status}`);
                return null;
            }
            const data: T = await response.json();
            return data;
        } catch (error) {
            this.logError(tag, error);
            return null;
        }
    }

    private logError(tag: string, error: unknown): void {
        if (!this.logger) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
            this.logger.appendLine(`[${tag}] Request timed out`);
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
            this.logger.appendLine(`[${tag}] Server connection refused`);
        } else {
            this.logger.appendLine(`[${tag}] Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
