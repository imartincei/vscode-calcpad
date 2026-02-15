import * as vscode from 'vscode';
import * as path from 'path';
import {
    CalcpadLintService,
    CalcpadApiClient,
    LintDiagnostic,
    buildClientFileCacheFromContent,
} from 'calcpad-frontend';
import { VSCodeLogger, VSCodeFileSystem } from './adapters';

/**
 * VS Code wrapper around CalcpadLintService from calcpad-frontend.
 * Converts platform-agnostic LintDiagnostic[] into vscode.Diagnostic[]
 * and manages a DiagnosticCollection for the editor.
 */
export class CalcpadServerLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private lintService: CalcpadLintService;
    private logger: VSCodeLogger;
    private fileSystem: VSCodeFileSystem;

    constructor(apiClient: CalcpadApiClient, debugChannel: vscode.OutputChannel) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('calcpad');
        this.logger = new VSCodeLogger(debugChannel);
        this.fileSystem = new VSCodeFileSystem();
        this.lintService = new CalcpadLintService(apiClient, this.logger);
    }

    public async lintDocument(document: vscode.TextDocument): Promise<void> {
        if (!document.fileName.endsWith('.cpd')) {
            this.diagnosticCollection.delete(document.uri);
            return;
        }

        const content = document.getText();

        try {
            const sourceDir = path.dirname(document.uri.fsPath);
            const clientFileCache = await buildClientFileCacheFromContent(
                content, sourceDir, this.fileSystem, this.logger
            );

            const lintResponse = await this.lintService.lintContent(content, clientFileCache);

            if (lintResponse) {
                const diagnostics = this.convertToDiagnostics(lintResponse.diagnostics);
                this.diagnosticCollection.set(document.uri, diagnostics);
            } else {
                this.diagnosticCollection.set(document.uri, []);
            }
        } catch (error) {
            this.logger.appendLine(
                '[Lint] Error: ' + (error instanceof Error ? error.message : 'Unknown error')
            );
            this.diagnosticCollection.set(document.uri, []);
        }
    }

    private getMinimumSeverity(): vscode.DiagnosticSeverity {
        const config = vscode.workspace.getConfiguration('calcpad');
        const level = config.get<string>('linter.minimumSeverity', 'information');
        switch (level) {
            case 'error': return vscode.DiagnosticSeverity.Error;
            case 'warning': return vscode.DiagnosticSeverity.Warning;
            default: return vscode.DiagnosticSeverity.Information;
        }
    }

    private convertToDiagnostics(serverDiagnostics: LintDiagnostic[]): vscode.Diagnostic[] {
        const minSeverity = this.getMinimumSeverity();

        return serverDiagnostics
            .map(d => {
                const range = new vscode.Range(d.line, d.column, d.line, d.endColumn);
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
            })
            .filter(d => d.severity <= minSeverity);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}
