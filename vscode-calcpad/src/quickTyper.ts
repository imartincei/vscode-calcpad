import * as vscode from 'vscode';
import { QUICK_TYPE_MAP, findQuickTypeReplacement } from 'calcpad-frontend';

/**
 * Handles automatic replacement of quick typing shortcuts with Unicode symbols.
 * Logic is provided by calcpad-frontend; this class handles VS Code event wiring.
 */
export class QuickTyper {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.outputChannel.appendLine(
            '[QUICK TYPER] Loaded ' + QUICK_TYPE_MAP.size + ' quick type shortcuts'
        );
    }

    public async processTextChange(
        document: vscode.TextDocument,
        change: vscode.TextDocumentContentChangeEvent
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('calcpad');
        const enableQuickTyping = config.get<boolean>('enableQuickTyping', true);
        if (!enableQuickTyping) {
            return;
        }

        if (change.text.length !== 1 || change.text !== ' ') {
            return;
        }

        const position = change.range.start;
        const line = document.lineAt(position.line);
        const lineText = line.text;

        const replacement = findQuickTypeReplacement(lineText, position.character);
        if (replacement) {
            await this.replaceQuickType(document, position, replacement);
        }
    }

    private async replaceQuickType(
        document: vscode.TextDocument,
        insertPosition: vscode.Position,
        replacement: { startPos: number; endPos: number; replacement: string }
    ): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
            insertPosition.line,
            replacement.startPos,
            insertPosition.line,
            insertPosition.character + 1
        );
        edit.replace(document.uri, range, replacement.replacement);

        const shortcut = document.lineAt(insertPosition.line).text.substring(
            replacement.startPos,
            replacement.endPos
        );
        this.outputChannel.appendLine(`[QUICK TYPER] ${shortcut} → ${replacement.replacement}`);

        await vscode.workspace.applyEdit(edit);
    }

    public registerDocumentChangeListener(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document.languageId !== 'calcpad' && event.document.languageId !== 'plaintext') {
                return;
            }
            if (event.contentChanges.length === 1) {
                await this.processTextChange(event.document, event.contentChanges[0]);
            }
        });
    }
}
