import * as monaco from 'monaco-editor';
import { CalcpadApiClient } from 'calcpad-frontend/api/client';
import { SEMANTIC_TOKEN_TYPES, mapTokenTypeToIndex } from 'calcpad-frontend/services/highlight';

/**
 * Register a DocumentSemanticTokensProvider that fetches tokens from the CalcPad server.
 * Returns a disposable to unregister the provider.
 */
export function registerSemanticTokensProvider(
    apiClient: CalcpadApiClient
): monaco.IDisposable {
    const legend = {
        tokenTypes: SEMANTIC_TOKEN_TYPES,
        tokenModifiers: [] as string[],
    };

    const provider: monaco.languages.DocumentSemanticTokensProvider = {
        getLegend() {
            return legend;
        },

        async provideDocumentSemanticTokens(model) {
            const content = model.getValue();
            const tokens = await apiClient.highlight(content);

            if (!tokens || tokens.length === 0) {
                return { data: new Uint32Array(0) };
            }

            // Sort tokens by line then column
            tokens.sort((a, b) => a.line !== b.line ? a.line - b.line : a.column - b.column);

            // Encode as delta-encoded uint32 array per Monaco spec:
            // [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
            const data: number[] = [];
            let prevLine = 0;
            let prevChar = 0;

            for (const token of tokens) {
                const tokenTypeIndex = mapTokenTypeToIndex(token.typeId);
                if (tokenTypeIndex < 0) continue;

                const line = token.line;       // 0-based from server
                const char = token.column;     // 0-based from server

                const deltaLine = line - prevLine;
                const deltaChar = deltaLine === 0 ? char - prevChar : char;

                data.push(deltaLine, deltaChar, token.length, tokenTypeIndex, 0);

                prevLine = line;
                prevChar = char;
            }

            return { data: new Uint32Array(data) };
        },

        releaseDocumentSemanticTokens() {
            // No cleanup needed
        },
    };

    return monaco.languages.registerDocumentSemanticTokensProvider('calcpad', provider);
}
