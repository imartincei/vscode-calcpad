import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';
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
    private outputChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;

    constructor(settingsManager: CalcpadSettingsManager, outputChannel: vscode.OutputChannel) {
        this.settingsManager = settingsManager;
        this.outputChannel = outputChannel;
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.SemanticTokens | null> {
        const content = document.getText();
        this.outputChannel.appendLine('[SemanticTokens] provideDocumentSemanticTokens called for: ' + document.fileName);

        // Skip empty documents
        if (!content.trim()) {
            this.outputChannel.appendLine('[SemanticTokens] Document is empty, skipping');
            return null;
        }

        try {
            this.outputChannel.appendLine('[SemanticTokens] Fetching tokens from server...');
            const tokens = await this.fetchHighlightTokens(content);

            if (!tokens) {
                this.outputChannel.appendLine('[SemanticTokens] No tokens returned from server');
                return null;
            }

            if (token.isCancellationRequested) {
                this.outputChannel.appendLine('[SemanticTokens] Request was cancelled');
                return null;
            }

            this.outputChannel.appendLine('[SemanticTokens] Received ' + tokens.length + ' tokens from server');

            const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend);

            // Sort tokens by line, then column (required for SemanticTokensBuilder)
            tokens.sort((a, b) => {
                if (a.line !== b.line) {
                    return a.line - b.line;
                }
                return a.column - b.column;
            });

            let validTokenCount = 0;
            for (const tok of tokens) {
                // Skip None type (typeId 0)
                if (tok.typeId === CalcpadTokenType.None) {
                    continue;
                }

                const tokenType = this.mapTokenType(tok.typeId);
                if (tokenType >= 0) {
                    builder.push(tok.line, tok.column, tok.length, tokenType, 0);
                    validTokenCount++;
                }
            }

            this.outputChannel.appendLine('[SemanticTokens] Built ' + validTokenCount + ' valid semantic tokens');
            return builder.build();
        } catch (error) {
            this.outputChannel.appendLine('[SemanticTokens] Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
    private async fetchHighlightTokens(content: string): Promise<HighlightToken[] | null> {
        const settings = this.settingsManager.getSettings();
        const apiBaseUrl = settings.server.url;

        if (!apiBaseUrl) {
            this.outputChannel.appendLine('[SemanticTokens] No server URL configured');
            return null;
        }

        const url = apiBaseUrl + '/api/calcpad/highlight';
        this.outputChannel.appendLine('[SemanticTokens] Calling: ' + url);

        const request: HighlightRequest = {
            content,
            includeText: false
        };

        try {
            const response = await axios.post<HighlightResponse>(
                url,
                request,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000  // Shorter timeout for highlighting (needs to be responsive)
                }
            );

            this.outputChannel.appendLine('[SemanticTokens] Server response status: ' + response.status);
            return response.data.tokens;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.code === 'ECONNREFUSED') {
                    this.outputChannel.appendLine('[SemanticTokens] Server not available (connection refused)');
                } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
                    this.outputChannel.appendLine('[SemanticTokens] Server request timed out');
                } else {
                    this.outputChannel.appendLine('[SemanticTokens] API error: ' + axiosError.message);
                    if (axiosError.response) {
                        this.outputChannel.appendLine('[SemanticTokens] Response status: ' + axiosError.response.status);
                    }
                }
            } else {
                this.outputChannel.appendLine('[SemanticTokens] Unknown error: ' + String(error));
            }
            return null;
        }
    }
}
