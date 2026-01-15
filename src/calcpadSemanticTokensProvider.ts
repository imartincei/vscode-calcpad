import * as vscode from 'vscode';
import axios from 'axios';
import { CalcpadSettingsManager } from './calcpadSettings';
import { HighlightRequest, HighlightResponse, HighlightToken, CalcpadTokenType } from './api/calcpadApiTypes';

/**
 * Semantic token types matching C# server TokenType enum (1:1 mapping)
 * Each token type has a unique VS Code semantic token for proper theming
 */
const SEMANTIC_TOKEN_TYPES = [
    // Core Syntax (1-4)
    'const',              // 1: Numeric constants
    'operator',           // 2: Operators
    'bracket',            // 3: Brackets
    'lineContinuation',   // 4: Line continuation marker

    // Identifiers (5-11)
    'variable',           // 5: Variable identifiers
    'localVariable',      // 6: Local variables (function params, loop vars)
    'function',           // 7: Function names
    'macro',              // 8: Macro names
    'macroParameter',     // 9: Macro parameters in #def statements
    'units',              // 10: Unit identifiers
    'setting',            // 11: Setting variables

    // Keywords and Commands (12-15)
    'keyword',            // 12: Keywords starting with #
    'controlBlockKeyword', // 13: Control block keywords (#if, #for, etc.)
    'endKeyword',         // 14: End keywords (#end if, #loop)
    'command',            // 15: Commands starting with $

    // File and Data Exchange (16-18)
    'include',            // 16: Include file paths
    'filePath',           // 17: File paths in data exchange
    'dataExchangeKeyword', // 18: Sub-keywords (from, to, sep, type)

    // Comments and Documentation (19-25)
    'comment',            // 19: Plain text comments
    'htmlComment',        // 20: HTML comments
    'tag',                // 21: HTML tags
    'htmlContent',        // 22: HTML content
    'javascript',         // 23: JavaScript code
    'css',                // 24: CSS code
    'svg',                // 25: SVG markup

    // Special (26-27)
    'input',              // 26: Input markers
    'format',             // 27: Format specifiers
];

/**
 * Map server typeId to semantic token type name (1:1 with C# enum)
 */
const TOKEN_TYPE_MAP: Record<number, string> = {
    [CalcpadTokenType.Const]: 'const',
    [CalcpadTokenType.Operator]: 'operator',
    [CalcpadTokenType.Bracket]: 'bracket',
    [CalcpadTokenType.LineContinuation]: 'lineContinuation',
    [CalcpadTokenType.Variable]: 'variable',
    [CalcpadTokenType.LocalVariable]: 'localVariable',
    [CalcpadTokenType.Function]: 'function',
    [CalcpadTokenType.Macro]: 'macro',
    [CalcpadTokenType.MacroParameter]: 'macroParameter',
    [CalcpadTokenType.Units]: 'units',
    [CalcpadTokenType.Setting]: 'setting',
    [CalcpadTokenType.Keyword]: 'keyword',
    [CalcpadTokenType.ControlBlockKeyword]: 'controlBlockKeyword',
    [CalcpadTokenType.EndKeyword]: 'endKeyword',
    [CalcpadTokenType.Command]: 'command',
    [CalcpadTokenType.Include]: 'include',
    [CalcpadTokenType.FilePath]: 'filePath',
    [CalcpadTokenType.DataExchangeKeyword]: 'dataExchangeKeyword',
    [CalcpadTokenType.Comment]: 'comment',
    [CalcpadTokenType.HtmlComment]: 'htmlComment',
    [CalcpadTokenType.Tag]: 'tag',
    [CalcpadTokenType.HtmlContent]: 'htmlContent',
    [CalcpadTokenType.JavaScript]: 'javascript',
    [CalcpadTokenType.Css]: 'css',
    [CalcpadTokenType.Svg]: 'svg',
    [CalcpadTokenType.Input]: 'input',
    [CalcpadTokenType.Format]: 'format',
};

// Semantic token modifiers (none needed currently)
const SEMANTIC_TOKEN_MODIFIERS: string[] = [];

// Export the legend for registration in extension.ts
export const semanticTokensLegend = new vscode.SemanticTokensLegend(
    SEMANTIC_TOKEN_TYPES,
    SEMANTIC_TOKEN_MODIFIERS
);

/**
 * Semantic token provider that fetches tokens from the Calcpad server
 */
export class CalcpadSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private debugChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;
    private requestId = 0;
    private _onDidChangeSemanticTokens = new vscode.EventEmitter<void>();
    public readonly onDidChangeSemanticTokens = this._onDidChangeSemanticTokens.event;

    constructor(settingsManager: CalcpadSettingsManager, debugChannel: vscode.OutputChannel) {
        this.settingsManager = settingsManager;
        this.debugChannel = debugChannel;
    }

    /**
     * Trigger a refresh of semantic tokens for all documents
     */
    public refresh(): void {
        this.debugChannel.appendLine('[Highlight] Manual refresh triggered');
        this._onDidChangeSemanticTokens.fire();
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        cancellationToken: vscode.CancellationToken
    ): Promise<vscode.SemanticTokens | null> {
        const content = document.getText();
        const reqId = ++this.requestId;
        const startTime = Date.now();

        this.debugChannel.appendLine('[Highlight #' + reqId + '] Request started for ' + document.fileName + ' (scheme: ' + document.uri.scheme + ', lang: ' + document.languageId + ', ' + content.length + ' chars)');

        // Skip empty documents
        if (!content.trim()) {
            this.debugChannel.appendLine('[Highlight #' + reqId + '] Skipped - empty document');
            return null;
        }

        try {
            const tokens = await this.fetchHighlightTokens(content, cancellationToken, reqId);

            if (cancellationToken.isCancellationRequested) {
                this.debugChannel.appendLine('[Highlight #' + reqId + '] Cancelled after ' + (Date.now() - startTime) + 'ms');
                return null;
            }

            if (!tokens) {
                this.debugChannel.appendLine('[Highlight #' + reqId + '] No tokens returned after ' + (Date.now() - startTime) + 'ms');
                return null;
            }

            this.debugChannel.appendLine('[Highlight #' + reqId + '] Received ' + tokens.length + ' tokens in ' + (Date.now() - startTime) + 'ms');

            const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend);

            // Sort tokens by line, then column (required for SemanticTokensBuilder)
            tokens.sort((a, b) => {
                if (a.line !== b.line) {
                    return a.line - b.line;
                }
                return a.column - b.column;
            });

            let validCount = 0;
            for (const tok of tokens) {
                // Skip None type (typeId 0)
                if (tok.typeId === CalcpadTokenType.None) {
                    continue;
                }

                const tokenType = this.mapTokenType(tok.typeId);
                if (tokenType >= 0) {
                    builder.push(tok.line, tok.column, tok.length, tokenType, 0);
                    validCount++;
                }
            }

            this.debugChannel.appendLine('[Highlight #' + reqId + '] Built ' + validCount + ' semantic tokens, total time: ' + (Date.now() - startTime) + 'ms');
            return builder.build();
        } catch (error) {
            this.debugChannel.appendLine('[Highlight #' + reqId + '] Error after ' + (Date.now() - startTime) + 'ms: ' + (error instanceof Error ? error.message : 'Unknown error'));
            return null;
        }
    }

    /**
     * Map server typeId to VS Code semantic token type index
     */
    private mapTokenType(typeId: number): number {
        const tokenTypeName = TOKEN_TYPE_MAP[typeId];
        if (!tokenTypeName) {
            return -1;
        }
        return SEMANTIC_TOKEN_TYPES.indexOf(tokenTypeName);
    }

    /**
     * Fetch highlight tokens from the server
     */
    private async fetchHighlightTokens(
        content: string,
        cancellationToken: vscode.CancellationToken,
        reqId: number
    ): Promise<HighlightToken[] | null> {
        const settings = this.settingsManager.getSettings();
        const apiBaseUrl = settings.server.url;

        if (!apiBaseUrl) {
            this.debugChannel.appendLine('[Highlight #' + reqId + '] No server URL configured');
            return null;
        }

        const url = apiBaseUrl + '/api/calcpad/highlight';

        const request: HighlightRequest = {
            content,
            includeText: false
        };

        // Create an AbortController to cancel the request if VS Code cancels
        const abortController = new AbortController();
        const cancelListener = cancellationToken.onCancellationRequested(() => {
            this.debugChannel.appendLine('[Highlight #' + reqId + '] Request cancelled by VS Code');
            abortController.abort();
        });

        try {
            this.debugChannel.appendLine('[Highlight #' + reqId + '] Sending request to server...');
            const response = await axios.post<HighlightResponse>(
                url,
                request,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000,  // 30 seconds for large files
                    signal: abortController.signal
                }
            );

            this.debugChannel.appendLine('[Highlight #' + reqId + '] Server responded with ' + response.data.tokens.length + ' tokens');
            return response.data.tokens;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ERR_CANCELED') {
                    this.debugChannel.appendLine('[Highlight #' + reqId + '] Request was aborted');
                } else if (error.code === 'ECONNREFUSED') {
                    this.debugChannel.appendLine('[Highlight #' + reqId + '] Server connection refused');
                } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                    this.debugChannel.appendLine('[Highlight #' + reqId + '] Request timed out');
                } else {
                    this.debugChannel.appendLine('[Highlight #' + reqId + '] API error: ' + error.message);
                }
            } else {
                this.debugChannel.appendLine('[Highlight #' + reqId + '] Unknown error: ' + String(error));
            }
            return null;
        } finally {
            cancelListener.dispose();
        }
    }
}
