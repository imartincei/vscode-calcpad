import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import { CalcpadSettingsManager } from './calcpadSettings';
import { LintRequest, LintResponse, LintDiagnostic, ClientFileCache } from './api/calcpadApiTypes';
import { buildClientFileCacheFromContent } from './clientFileCacheHelper';

/**
 * Server-side CalcPad linter
 *
 * Calls the /api/calcpad/lint endpoint to perform linting on the server.
 * Include files are resolved by the server, with local workspace files
 * passed via clientFileCache for files referenced in #include/#read directives.
 */
export class CalcpadServerLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debugChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;
    private requestId = 0;

    constructor(settingsManager: CalcpadSettingsManager, debugChannel: vscode.OutputChannel) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('calcpad');
        this.settingsManager = settingsManager;
        this.debugChannel = debugChannel;
    }

    /**
     * Main entry point for linting a document
     */
    public async lintDocument(document: vscode.TextDocument): Promise<void> {
        // Only lint .cpd files
        if (!document.fileName.endsWith('.cpd')) {
            this.diagnosticCollection.delete(document.uri);
            return;
        }

        const reqId = ++this.requestId;
        const startTime = Date.now();
        const content = document.getText();

        this.debugChannel.appendLine('[Lint #' + reqId + '] Request started for ' + document.fileName + ' (' + content.length + ' chars)');

        try {
            // Build client file cache for referenced files
            const clientFileCache = await buildClientFileCacheFromContent(content, this.debugChannel, '[Lint #' + reqId + ']');

            // Call server lint API with client file cache
            const lintResponse = await this.fetchLintDiagnostics(content, reqId, clientFileCache);

            if (lintResponse) {
                const diagnostics = this.convertToDiagnostics(lintResponse.diagnostics);
                this.diagnosticCollection.set(document.uri, diagnostics);
                this.debugChannel.appendLine('[Lint #' + reqId + '] Found ' + lintResponse.errorCount + ' errors, ' + lintResponse.warningCount + ' warnings in ' + (Date.now() - startTime) + 'ms');
            } else {
                // Server unavailable - clear diagnostics rather than show stale data
                this.diagnosticCollection.set(document.uri, []);
                this.debugChannel.appendLine('[Lint #' + reqId + '] No response from server after ' + (Date.now() - startTime) + 'ms');
            }
        } catch (error) {
            this.debugChannel.appendLine('[Lint #' + reqId + '] Error after ' + (Date.now() - startTime) + 'ms: ' + (error instanceof Error ? error.message : 'Unknown error'));
            // Clear diagnostics on error
            this.diagnosticCollection.set(document.uri, []);
        }
    }

    /**
     * Call the server lint API
     */
    private async fetchLintDiagnostics(
        content: string,
        reqId: number,
        clientFileCache?: ClientFileCache
    ): Promise<LintResponse | null> {
        const settings = this.settingsManager.getSettings();
        const apiBaseUrl = settings.server.url;

        if (!apiBaseUrl) {
            this.debugChannel.appendLine('[Lint #' + reqId + '] No server URL configured');
            return null;
        }

        const request: LintRequest = {
            content,
            clientFileCache
        };

        try {
            this.debugChannel.appendLine('[Lint #' + reqId + '] Sending request to server...');
            const response = await axios.post<LintResponse>(
                apiBaseUrl + '/api/calcpad/lint',
                request,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000  // 30 seconds for large files
                }
            );

            this.debugChannel.appendLine('[Lint #' + reqId + '] Server response: ' + JSON.stringify(response.data));
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.code === 'ECONNREFUSED') {
                    this.debugChannel.appendLine('[Lint #' + reqId + '] Server connection refused');
                } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
                    this.debugChannel.appendLine('[Lint #' + reqId + '] Request timed out');
                } else {
                    this.debugChannel.appendLine('[Lint #' + reqId + '] API error: ' + axiosError.message);
                }
            } else {
                this.debugChannel.appendLine('[Lint #' + reqId + '] Unexpected error: ' + (error instanceof Error ? error.message : String(error)));
            }
            return null;
        }
    }

    /**
     * Convert server diagnostics to VS Code diagnostics
     */
    private convertToDiagnostics(serverDiagnostics: LintDiagnostic[]): vscode.Diagnostic[] {
        return serverDiagnostics.map(d => {
            const range = new vscode.Range(
                d.line,
                d.column,
                d.line,
                d.endColumn
            );

            const severity = d.severityId === 0
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;

            const diagnostic = new vscode.Diagnostic(
                range,
                '[' + d.code + '] ' + d.message,
                severity
            );
            diagnostic.code = d.code;
            diagnostic.source = d.source;

            return diagnostic;
        });
    }

    /**
     * Clear diagnostics for a document
     */
    public clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}
