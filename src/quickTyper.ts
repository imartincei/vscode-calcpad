import * as vscode from 'vscode';

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
     * Build the quick type replacement map with hardcoded shortcuts
     */
    private buildQuickTypeMap(): void {
        this.quickTypeMap.clear();

        // Special Symbols
        this.quickTypeMap.set('~%', '‰');      // Per Mille
        this.quickTypeMap.set('~%%', '‱');     // Per Ten Thousand
        this.quickTypeMap.set('~0', '°');      // Degree Symbol
        this.quickTypeMap.set("~'", '′');      // Prime
        this.quickTypeMap.set('~"', '″');      // Double Prime
        this.quickTypeMap.set("~'''", '‴');    // Triple Prime
        this.quickTypeMap.set("~''''", '⁗');   // Quadruple Prime
        this.quickTypeMap.set('~/o', 'ø');     // Lowercase Diameter
        this.quickTypeMap.set('~/O', 'Ø');     // Uppercase Diameter

        // Greek Letters (Lowercase)
        this.quickTypeMap.set('~a', 'α');      // Alpha
        this.quickTypeMap.set('~b', 'β');      // Beta
        this.quickTypeMap.set('~g', 'γ');      // Gamma
        this.quickTypeMap.set('~d', 'δ');      // Delta
        this.quickTypeMap.set('~e', 'ε');      // Epsilon
        this.quickTypeMap.set('~z', 'ζ');      // Zeta
        this.quickTypeMap.set('~h', 'η');      // Eta
        this.quickTypeMap.set('~q', 'θ');      // Theta
        this.quickTypeMap.set('~i', 'ι');      // Iota
        this.quickTypeMap.set('~k', 'κ');      // Kappa
        this.quickTypeMap.set('~l', 'λ');      // Lambda
        this.quickTypeMap.set('~m', 'μ');      // Mu
        this.quickTypeMap.set('~n', 'ν');      // Nu
        this.quickTypeMap.set('~x', 'ξ');      // Xi
        this.quickTypeMap.set('~o', 'ο');      // Omicron
        this.quickTypeMap.set('~p', 'π');      // Pi
        this.quickTypeMap.set('~r', 'ρ');      // Rho
        this.quickTypeMap.set('~j', 'ς');      // Final Sigma
        this.quickTypeMap.set('~s', 'σ');      // Sigma
        this.quickTypeMap.set('~t', 'τ');      // Tau
        this.quickTypeMap.set('~u', 'υ');      // Upsilon
        this.quickTypeMap.set('~f', 'φ');      // Phi
        this.quickTypeMap.set('~c', 'χ');      // Chi
        this.quickTypeMap.set('~y', 'ψ');      // Psi
        this.quickTypeMap.set('~w', 'ω');      // Omega

        // Greek Letters (Uppercase)
        this.quickTypeMap.set('~A', 'Α');      // Alpha
        this.quickTypeMap.set('~B', 'Β');      // Beta
        this.quickTypeMap.set('~G', 'Γ');      // Gamma
        this.quickTypeMap.set('~D', 'Δ');      // Delta
        this.quickTypeMap.set('~E', 'Ε');      // Epsilon
        this.quickTypeMap.set('~Z', 'Ζ');      // Zeta
        this.quickTypeMap.set('~H', 'Η');      // Eta
        this.quickTypeMap.set('~Q', 'Θ');      // Theta
        this.quickTypeMap.set('~I', 'Ι');      // Iota
        this.quickTypeMap.set('~K', 'Κ');      // Kappa
        this.quickTypeMap.set('~L', 'Λ');      // Lambda
        this.quickTypeMap.set('~M', 'Μ');      // Mu
        this.quickTypeMap.set('~N', 'Ν');      // Nu
        this.quickTypeMap.set('~X', 'Ξ');      // Xi
        this.quickTypeMap.set('~O', 'Ο');      // Omicron
        this.quickTypeMap.set('~P', 'Π');      // Pi
        this.quickTypeMap.set('~R', 'Ρ');      // Rho
        this.quickTypeMap.set('~S', 'Σ');      // Sigma
        this.quickTypeMap.set('~T', 'Τ');      // Tau
        this.quickTypeMap.set('~U', 'Υ');      // Upsilon
        this.quickTypeMap.set('~F', 'Φ');      // Phi
        this.quickTypeMap.set('~C', 'Χ');      // Chi
        this.quickTypeMap.set('~Y', 'Ψ');      // Psi
        this.quickTypeMap.set('~W', 'Ω');      // Omega

        this.outputChannel.appendLine(
            '[QUICK TYPER] Loaded ' + this.quickTypeMap.size + ' quick type shortcuts'
        );
    }

    /**
     * Process text change and replace quick type shortcuts with Unicode symbols
     * Only triggers when spacebar is pressed after a ~ pattern
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

        // Only activate on spacebar
        if (change.text !== ' ') {
            return;
        }

        const position = change.range.start;
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Look for quick type patterns that end just before the space
        const replacement = this.findQuickTypeReplacement(lineText, position.character);
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
     * Also removes the space that triggered the replacement
     */
    private async replaceQuickType(
        document: vscode.TextDocument,
        insertPosition: vscode.Position,
        replacement: { startPos: number; endPos: number; replacement: string }
    ): Promise<void> {
        const edit = new vscode.WorkspaceEdit();

        // Create range for the shortcut to replace (includes the space after it)
        // insertPosition points to where the space was inserted, so we need to include it
        const range = new vscode.Range(
            insertPosition.line,
            replacement.startPos,
            insertPosition.line,
            insertPosition.character + 1  // Include the space that was just typed
        );

        // Replace with Unicode character (no trailing space)
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

            // Only process single change (typing scenario)
            // Multiple changes would be from paste/other operations which we ignore anyway
            if (event.contentChanges.length === 1) {
                await this.processTextChange(event.document, event.contentChanges[0]);
            }
        });
    }
}