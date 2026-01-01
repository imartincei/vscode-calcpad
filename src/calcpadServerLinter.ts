import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
import { CalcpadSettingsManager } from './calcpadSettings';
import { CalcpadContentResolver } from './calcpadContentResolver';
import { LintRequest, LintResponse, LintDiagnostic } from './api/calcpadApiTypes';

/**
 * Server-side CalcPad linter
 *
 * Calls the /api/calcpad/lint endpoint to perform linting on the server.
 * Include files are resolved locally and passed to the server.
 */
export class CalcpadServerLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;
    private contentResolver: CalcpadContentResolver;

    constructor(settingsManager: CalcpadSettingsManager, outputChannel: vscode.OutputChannel) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('calcpad');
        this.settingsManager = settingsManager;
        this.outputChannel = outputChannel;
        this.contentResolver = new CalcpadContentResolver(settingsManager, outputChannel);
    }

    public getContentResolver(): CalcpadContentResolver {
        return this.contentResolver;
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

        const content = document.getText();
        const lines = content.split('\n');

        try {
            // Pre-cache include files (needed for server lint request)
            await this.contentResolver.preCacheContent(lines);

            // Build include files map for the server
            const includeFiles = this.buildIncludeFilesMap(lines);

            // Call server lint API
            const lintResponse = await this.fetchLintDiagnostics(content, includeFiles);

            if (lintResponse) {
                const diagnostics = this.convertToDiagnostics(lintResponse.diagnostics);
                this.diagnosticCollection.set(document.uri, diagnostics);
                this.outputChannel.appendLine(`[Linter] Found ${lintResponse.errorCount} errors, ${lintResponse.warningCount} warnings`);
            } else {
                // Server unavailable - clear diagnostics rather than show stale data
                this.diagnosticCollection.set(document.uri, []);
            }
        } catch (error) {
            this.outputChannel.appendLine(`[Linter] Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Clear diagnostics on error
            this.diagnosticCollection.set(document.uri, []);
        }
    }

    /**
     * Build a map of include file names to their content
     */
    private buildIncludeFilesMap(lines: string[]): Record<string, string> {
        const includeFiles: Record<string, string> = {};

        for (const line of lines) {
            const includeMatch = /#include\s+([^\s]+)/.exec(line);
            if (includeMatch) {
                const fileName = includeMatch[1].replace(/['"]/g, '');
                const cachedContent = this.contentResolver.getCachedContent(fileName);
                if (cachedContent) {
                    includeFiles[fileName] = cachedContent.join('\n');
                }
            }
        }

        return includeFiles;
    }

    /**
     * Call the server lint API
     */
    private async fetchLintDiagnostics(
        content: string,
        includeFiles: Record<string, string>
    ): Promise<LintResponse | null> {
        const settings = this.settingsManager.getSettings();
        const apiBaseUrl = settings.server.url;

        if (!apiBaseUrl) {
            this.outputChannel.appendLine('[Linter] Server URL not configured');
            return null;
        }

        const request: LintRequest = {
            content,
            includeFiles: Object.keys(includeFiles).length > 0 ? includeFiles : undefined
        };

        try {
            const response = await axios.post<LintResponse>(
                apiBaseUrl + '/api/calcpad/lint',
                request,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.code === 'ECONNREFUSED') {
                    this.outputChannel.appendLine('[Linter] Calcpad server not available');
                } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
                    this.outputChannel.appendLine('[Linter] Server request timed out');
                } else {
                    this.outputChannel.appendLine('[Linter] API error: ' + axiosError.message);
                }
            } else {
                this.outputChannel.appendLine('[Linter] Unexpected error: ' + (error instanceof Error ? error.message : String(error)));
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
