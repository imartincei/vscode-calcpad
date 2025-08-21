import * as vscode from 'vscode';

/**
 * Handles automatic replacement of C-style operators with Unicode equivalents
 * Based on C# ReplaceCStyleOperators functionality
 */
export class OperatorReplacer {
    private outputChannel: vscode.OutputChannel;

    // Mapping of operator sequences to their Unicode replacements
    private static readonly OPERATOR_REPLACEMENTS: Record<string, string> = {
        '==': '≡',
        '!=': '≠', 
        '>=': '≥',
        '<=': '≤',
        '%%': '⦼',
        '&&': '∧',
        '||': '∨'
    };

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Process text change and replace C-style operators with Unicode equivalents
     * Only processes changes outside of string literals and comments
     */
    public async processTextChange(
        document: vscode.TextDocument,
        change: vscode.TextDocumentContentChangeEvent
    ): Promise<void> {
        // Only process single character insertions that could complete an operator
        if (change.text.length !== 1) {
            return;
        }

        const insertedChar = change.text;
        const position = change.range.start;
        
        // Check if the inserted character could complete an operator
        if (!this.isOperatorTriggerChar(insertedChar)) {
            return;
        }

        // Get the line content
        const line = document.lineAt(position.line);
        const lineText = line.text;
        
        // Check if we're inside a string or comment
        if (this.isInsideStringOrComment(lineText, position.character)) {
            return;
        }

        // Look for operator patterns that end at the insertion point
        const replacement = this.findOperatorReplacement(lineText, position.character + 1);
        if (replacement) {
            await this.replaceOperator(document, position, replacement);
        }
    }

    /**
     * Check if the character can trigger an operator replacement
     */
    private isOperatorTriggerChar(char: string): boolean {
        return ['=', '%', '&', '|'].includes(char);
    }

    /**
     * Check if position is inside a string literal or comment
     */
    private isInsideStringOrComment(lineText: string, position: number): boolean {
        let inString = false;
        let stringChar = '';
        let inComment = false;

        for (let i = 0; i < position; i++) {
            const char = lineText[i];
            
            if (!inString && !inComment) {
                if (char === '"' || char === "'") {
                    inString = true;
                    stringChar = char;
                } else if (char === "'") {
                    // CalcPad uses ' for comments
                    inComment = true;
                }
            } else if (inString && char === stringChar) {
                // Check if it's not escaped
                if (i === 0 || lineText[i - 1] !== '\\') {
                    inString = false;
                    stringChar = '';
                }
            }
        }

        return inString || inComment;
    }

    /**
     * Find operator replacement at the given position
     */
    private findOperatorReplacement(lineText: string, endPosition: number): {
        startPos: number;
        endPos: number;
        replacement: string;
    } | null {
        // Check for 2-character operators
        if (endPosition >= 2) {
            const twoChar = lineText.substring(endPosition - 2, endPosition);
            if (OperatorReplacer.OPERATOR_REPLACEMENTS[twoChar]) {
                return {
                    startPos: endPosition - 2,
                    endPos: endPosition,
                    replacement: OperatorReplacer.OPERATOR_REPLACEMENTS[twoChar]
                };
            }
        }

        return null;
    }

    /**
     * Replace the operator in the document
     */
    private async replaceOperator(
        document: vscode.TextDocument,
        insertPosition: vscode.Position,
        replacement: { startPos: number; endPos: number; replacement: string }
    ): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        
        // Create range for the operator to replace
        const range = new vscode.Range(
            insertPosition.line,
            replacement.startPos,
            insertPosition.line,
            replacement.endPos
        );

        // Replace with Unicode character
        edit.replace(document.uri, range, replacement.replacement);
        
        this.outputChannel.appendLine(
            `[OPERATOR REPLACE] ${document.lineAt(insertPosition.line).text.substring(replacement.startPos, replacement.endPos)} → ${replacement.replacement}`
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