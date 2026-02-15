import * as vscode from 'vscode';

/**
 * Handles automatic indentation for Calcpad control blocks.
 *
 * Increases indent after:
 *   #if, #else, #else if, #for, #repeat, #def (multiline)
 *
 * Decreases indent before:
 *   #end if, #else, #else if, #loop, #end def
 *
 * Control structures:
 *   #repeat ... #loop
 *   #if ... #else if ... #else ... #end if
 *   #for ... #loop
 *   #def ... #end def (multiline macros)
 */
export class AutoIndenter {
    private outputChannel: vscode.OutputChannel;

    // Keywords that increase indentation (block openers)
    private static readonly INDENT_INCREASE_PATTERNS: RegExp[] = [
        /^\s*#if\b/,           // #if condition
        /^\s*#else\s+if\b/,    // #else if condition (also decreases before)
        /^\s*#else\s*$/,       // #else (also decreases before) - must be alone or with comment
        /^\s*#else\s+'/,       // #else with comment
        /^\s*#for\b/,          // #for loop
        /^\s*#repeat\b/,       // #repeat loop
        /^\s*#def\s+\w+\$?\s*(?:\([^)]*\))?\s*$/,  // Multiline #def (no = at end)
        /^\s*#def\s+\w+\$?\s*(?:\([^)]*\))?\s+'/,  // Multiline #def with comment
    ];

    // Keywords that decrease indentation (block closers)
    private static readonly INDENT_DECREASE_PATTERNS: RegExp[] = [
        /^\s*#end\s+if\b/,     // #end if
        /^\s*#else\s+if\b/,    // #else if (decreases before, increases after)
        /^\s*#else\s*$/,       // #else (decreases before, increases after)
        /^\s*#else\s+'/,       // #else with comment
        /^\s*#loop\b/,         // #loop (ends #for and #repeat)
        /^\s*#end\s+def\b/,    // #end def
    ];

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Process text change to handle auto-indentation after Enter
     */
    public async processTextChange(
        document: vscode.TextDocument,
        change: vscode.TextDocumentContentChangeEvent
    ): Promise<void> {
        // Only process newline insertions
        if (!change.text.includes('\n')) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }

        // Get the position after the newline
        const newLinePos = change.range.start.line + 1;
        if (newLinePos >= document.lineCount) {
            return;
        }

        const previousLine = document.lineAt(change.range.start.line);
        const previousLineText = previousLine.text;
        const currentLine = document.lineAt(newLinePos);
        const currentLineText = currentLine.text;

        // Get the base indentation from the previous line
        const previousIndent = this.getIndentation(previousLineText);
        const indentUnit = this.getIndentUnit();

        // Check if previous line should increase indent
        const shouldIncrease = this.shouldIncreaseIndent(previousLineText);

        // Calculate target indentation
        let targetIndent = previousIndent;
        if (shouldIncrease) {
            targetIndent = previousIndent + indentUnit;
        }

        // Get current indentation of the new line
        const currentIndent = this.getIndentation(currentLineText);

        // Only adjust if different from target
        if (currentIndent !== targetIndent) {
            const edit = new vscode.WorkspaceEdit();
            const indentRange = new vscode.Range(
                newLinePos, 0,
                newLinePos, currentIndent.length
            );
            edit.replace(document.uri, indentRange, targetIndent);
            await vscode.workspace.applyEdit(edit);

            // Move cursor to end of indentation
            const newPosition = new vscode.Position(newLinePos, targetIndent.length);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }
    }

    /**
     * Adjust indentation when typing a dedent keyword
     */
    public async processKeywordTyped(
        document: vscode.TextDocument,
        change: vscode.TextDocumentContentChangeEvent
    ): Promise<void> {
        const position = change.range.start;
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Check if the line now matches a dedent pattern
        const shouldDecrease = this.shouldDecreaseIndent(lineText);
        if (!shouldDecrease) {
            return;
        }

        // Check if this is a keyword that also increases (like #else)
        const alsoIncreases = this.shouldIncreaseIndent(lineText);

        // Get expected indentation based on previous non-empty line
        const expectedIndent = this.calculateExpectedIndent(document, position.line, alsoIncreases);
        const currentIndent = this.getIndentation(lineText);

        if (currentIndent !== expectedIndent) {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== document) {
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            const indentRange = new vscode.Range(
                position.line, 0,
                position.line, currentIndent.length
            );
            edit.replace(document.uri, indentRange, expectedIndent);
            await vscode.workspace.applyEdit(edit);

            this.outputChannel.appendLine('[AUTO-INDENT] Adjusted indent for: ' + lineText.trim());
        }
    }

    /**
     * Check if line should increase indent for the next line
     */
    private shouldIncreaseIndent(lineText: string): boolean {
        for (const pattern of AutoIndenter.INDENT_INCREASE_PATTERNS) {
            if (pattern.test(lineText)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if line should decrease its own indent
     */
    private shouldDecreaseIndent(lineText: string): boolean {
        for (const pattern of AutoIndenter.INDENT_DECREASE_PATTERNS) {
            if (pattern.test(lineText)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calculate expected indentation for a dedent keyword
     */
    private calculateExpectedIndent(document: vscode.TextDocument, lineNumber: number, _alsoIncreases: boolean): string {
        // Find the matching opener by walking backward
        let depth = 1; // We need to find the matching opener

        for (let i = lineNumber - 1; i >= 0; i--) {
            const line = document.lineAt(i);
            const lineText = line.text;

            // Skip empty lines
            if (lineText.trim() === '') {
                continue;
            }

            // Check for closers (increases depth we need to match)
            if (this.shouldDecreaseIndent(lineText) && !this.shouldIncreaseIndent(lineText)) {
                depth++;
            }
            // Check for openers (decreases depth)
            else if (this.shouldIncreaseIndent(lineText)) {
                depth--;
                if (depth === 0) {
                    // Found the matching opener, use its indentation
                    return this.getIndentation(lineText);
                }
            }
        }

        // No matching opener found, return current document indent or empty
        return '';
    }

    /**
     * Get the indentation (leading whitespace) of a line
     */
    private getIndentation(lineText: string): string {
        const match = /^(\s*)/.exec(lineText);
        return match ? match[1] : '';
    }

    /**
     * Get the indent unit based on editor settings
     */
    private getIndentUnit(): string {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const tabSize = editor.options.tabSize as number || 4;
            const insertSpaces = editor.options.insertSpaces as boolean;
            if (insertSpaces) {
                return ' '.repeat(tabSize);
            } else {
                return '\t';
            }
        }
        return '    '; // Default to 4 spaces
    }

    /**
     * Register document change listener for auto-indentation
     */
    public registerDocumentChangeListener(_context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.workspace.onDidChangeTextDocument(async (event) => {
            // Only process CalcPad files
            if (event.document.languageId !== 'calcpad') {
                return;
            }

            // Process each change
            for (const change of event.contentChanges) {
                // Check for newline insertion
                if (change.text.includes('\n')) {
                    await this.processTextChange(event.document, change);
                }
                // Check for keyword completion that might need dedent
                else if (change.text.length > 0) {
                    // Debounce to avoid processing every character
                    const lineText = event.document.lineAt(change.range.start.line).text;
                    // Only check when a space or keyword-ending character is typed
                    if (this.couldCompleteDedentKeyword(lineText)) {
                        await this.processKeywordTyped(event.document, change);
                    }
                }
            }
        });
    }

    /**
     * Check if line could have just completed a dedent keyword
     */
    private couldCompleteDedentKeyword(lineText: string): boolean {
        const trimmed = lineText.trim();
        // Check for common dedent keyword patterns
        return (
            trimmed === '#else' ||
            trimmed.startsWith('#else if') ||
            trimmed === '#end if' ||
            trimmed === '#loop' ||
            trimmed === '#end def'
        );
    }
}
