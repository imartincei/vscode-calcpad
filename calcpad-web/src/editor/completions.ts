import * as monaco from 'monaco-editor';
import { CalcpadSnippetService } from 'calcpad-frontend/services/snippets';
import type { InsertItem } from 'calcpad-frontend/types/snippets';

/**
 * Register a CompletionItemProvider that suggests snippets from the CalcPad server.
 * Returns a disposable to unregister the provider.
 */
export function registerCompletionProvider(
    snippetService: CalcpadSnippetService
): monaco.IDisposable {
    const provider: monaco.languages.CompletionItemProvider = {
        triggerCharacters: ['#', '$', '.'],

        provideCompletionItems(model, position) {
            const items = snippetService.getAllItems();
            if (!items || items.length === 0) {
                return { suggestions: [] };
            }

            const word = model.getWordUntilPosition(position);
            const range: monaco.IRange = {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
            };

            const suggestions: monaco.languages.CompletionItem[] = items.map(
                (item: InsertItem) => ({
                    label: item.label || item.tag,
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: item.tag,
                    detail: item.categoryPath,
                    documentation: item.description,
                    range,
                })
            );

            return { suggestions };
        },
    };

    return monaco.languages.registerCompletionItemProvider('calcpad', provider);
}
