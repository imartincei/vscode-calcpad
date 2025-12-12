import * as vscode from 'vscode';
import * as insertData from './data/insert.json';

/**
 * Handles automatic replacement of quick typing shortcuts with Unicode symbols
 * Uses ~ prefix (e.g., ~a -> α, ~' -> ′)
 */
export class QuickTyper {
    private outputChannel: vscode.OutputChannel;
    private quickTypeMap: Map<string, string> = new Map();

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.buildQuickTypeMap();
    }

    /**
     * Build the quick type replacement map from insert.json
     */
    private buildQuickTypeMap(): void {
        this.quickTypeMap.clear();
        this.extractQuickTypes(insertData);

        this.outputChannel.appendLine(
            `[QUICK TYPER] Loaded ${this.quickTypeMap.size} quick type shortcuts`
        );
    }

    /**
     * Recursively extract quick type mappings from insert data
     */
    private extractQuickTypes(data: unknown): void {
        if (typeof data !== 'object' || data === null) return;

        if (Array.isArray(data)) {
            // Process array of items
            data.forEach(item => {
                if (this.isQuickTypeItem(item)) {
                    this.quickTypeMap.set(item.quickType, item.tag);
                }
            });
        } else {
            // Process object properties recursively
            Object.values(data as Record<string, unknown>).forEach(value => {
                this.extractQuickTypes(value);
            });
        }
    }

    /**
     * Check if an item has a quickType property
     */
    private isQuickTypeItem(item: unknown): item is { tag: string; quickType: string } {
        return typeof item === 'object' &&
               item !== null &&
               'tag' in item &&
               'quickType' in item &&
               typeof (item as { tag: string; quickType: string }).tag === 'string' &&
               typeof (item as { tag: string; quickType: string }).quickType === 'string';
    }

    /**
     * Process text change and replace quick type shortcuts with Unicode symbols
     */
    public async processTextChange(
        document: vscode.TextDocument,
        change: vscode.TextDocumentContentChangeEvent
    ): Promise<void> {
        // Check if quick typing is enabled in settings
        const config = vscode.workspace.getConfiguration('calcpad');
        const enableQuickTyping = config.get<boolean>('enableQuickTyping', true);

        if (!enableQuickTyping) {
            return;
        }

        // Only process single character insertions
        if (change.text.length !== 1) {
            return;
        }

        const position = change.range.start;
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Look for quick type patterns that end at the insertion point
        const replacement = this.findQuickTypeReplacement(lineText, position.character + 1);
        if (replacement) {
            await this.replaceQuickType(document, position, replacement);
        }
    }

    /**
     * Find quick type replacement at the given position
     * Checks for patterns starting with ~ and up to 4 characters long
     */
    private findQuickTypeReplacement(lineText: string, endPosition: number): {
        startPos: number;
        endPos: number;
        replacement: string;
    } | null {
        // Quick type patterns start with ~ and can be up to 4 characters after ~
        // Examples: ~a, ~', ~", ~''', ~'''', ~\o
        const maxLength = 5; // ~ + up to 4 characters

        for (let len = 2; len <= maxLength && len <= endPosition; len++) {
            const startPos = endPosition - len;
            const candidate = lineText.substring(startPos, endPosition);

            // Only check patterns that start with ~
            if (candidate[0] === '~') {
                const replacement = this.quickTypeMap.get(candidate);
                if (replacement) {
                    return {
                        startPos,
                        endPos: endPosition,
                        replacement
                    };
                }
            }
        }

        return null;
    }

    /**
     * Replace the quick type shortcut in the document
     */
    private async replaceQuickType(
        document: vscode.TextDocument,
        insertPosition: vscode.Position,
        replacement: { startPos: number; endPos: number; replacement: string }
    ): Promise<void> {
        const edit = new vscode.WorkspaceEdit();

        // Create range for the shortcut to replace
        const range = new vscode.Range(
            insertPosition.line,
            replacement.startPos,
            insertPosition.line,
            replacement.endPos
        );

        // Replace with Unicode character
        edit.replace(document.uri, range, replacement.replacement);

        const shortcut = document.lineAt(insertPosition.line).text.substring(
            replacement.startPos,
            replacement.endPos
        );

        this.outputChannel.appendLine(
            `[QUICK TYPER] ${shortcut} → ${replacement.replacement}`
        );

        await vscode.workspace.applyEdit(edit);
    }

    /**
     * Register document change listener
     */
    public registerDocumentChangeListener(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.workspace.onDidChangeTextDocument(async (event) => {
            // Only process CalcPad files
            if (event.document.languageId !== 'calcpad' && event.document.languageId !== 'plaintext') {
                return;
            }

            // Process each change
            for (const change of event.contentChanges) {
                await this.processTextChange(event.document, change);
            }
        });
    }
}