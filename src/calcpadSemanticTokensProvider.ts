import * as vscode from 'vscode';
import axios from 'axios';
import { CalcpadSettingsManager } from './calcpadSettings';
import { HighlightRequest, HighlightResponse, HighlightToken, CalcpadTokenType } from './api/calcpadApiTypes';

/**
 * VS Code semantic token types mapped from server typeId
 *
 * Server token types (from API_SCHEMA.md):
 * 0: None (skip)
 * 1: Const -> number
 * 2: Units -> type
 * 3: Operator -> operator
 * 4: Variable -> variable
 * 5: Function -> function
 * 6: Keyword -> keyword
 * 7: Command -> macro
 * 8: Bracket -> punctuation (custom)
 * 9: Comment -> comment
 * 10: Tag -> string (HTML in comments)
 * 11: Input -> parameter
 * 12: Include -> string
 * 13: Macro -> macro
 * 14: HtmlComment -> comment
 * 15: Format -> decorator
 * 16: LocalVariable -> parameter (function params, #for vars, command scope vars)
 * 17: FilePath -> string (file paths in #read, #write, #append)
 * 18: DataExchangeKeyword -> keyword (sub-keywords: from, to, sep, type)
 */
const TOKEN_TYPE_MAP: Record<number, string> = {
    [CalcpadTokenType.Const]: 'number',
    [CalcpadTokenType.Units]: 'type',
    [CalcpadTokenType.Operator]: 'operator',
    [CalcpadTokenType.Variable]: 'variable',
    [CalcpadTokenType.Function]: 'function',
    [CalcpadTokenType.Keyword]: 'keyword',
    [CalcpadTokenType.Command]: 'macro',
    [CalcpadTokenType.Bracket]: 'punctuation',
    [CalcpadTokenType.Comment]: 'comment',
    [CalcpadTokenType.Tag]: 'string',
    [CalcpadTokenType.Input]: 'parameter',
    [CalcpadTokenType.Include]: 'string',
    [CalcpadTokenType.Macro]: 'macro',
    [CalcpadTokenType.HtmlComment]: 'comment',
    [CalcpadTokenType.Format]: 'decorator',
    [CalcpadTokenType.LocalVariable]: 'parameter',
    [CalcpadTokenType.FilePath]: 'string',
    [CalcpadTokenType.DataExchangeKeyword]: 'keyword',
};

// Build unique token types list (preserving order for legend)
const SEMANTIC_TOKEN_TYPES = [
    'number',       // Const
    'type',         // Units
    'operator',     // Operator
    'variable',     // Variable
    'function',     // Function
    'keyword',      // Keyword
    'macro',        // Command, Macro
    'punctuation',  // Bracket (custom type)
    'comment',      // Comment, HtmlComment
    'string',       // Tag, Include
    'parameter',    // Input
    'decorator',    // Format
];

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

    constructor(settingsManager: CalcpadSettingsManager, debugChannel: vscode.OutputChannel) {
        this.settingsManager = settingsManager;
        this.debugChannel = debugChannel;
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
