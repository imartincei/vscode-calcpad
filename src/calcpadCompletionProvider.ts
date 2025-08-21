import * as vscode from 'vscode';
import { CalcpadInsertManager, InsertItem } from './calcpadInsertManager';
import { CalcpadContentResolver } from './calcpadContentResolver';
import { CalcpadSettingsManager } from './calcpadSettings';

export class CalcpadCompletionProvider implements vscode.CompletionItemProvider {
    private insertManager: CalcpadInsertManager;
    private contentResolver: CalcpadContentResolver;
    private outputChannel: vscode.OutputChannel;

    constructor(settingsManager: CalcpadSettingsManager, outputChannel: vscode.OutputChannel) {
        this.insertManager = CalcpadInsertManager.getInstance();
        this.contentResolver = new CalcpadContentResolver(settingsManager, outputChannel);
        this.outputChannel = outputChannel;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        const completionItems: vscode.CompletionItem[] = [];
        
        // Get the word being typed
        const wordRange = document.getWordRangeAtPosition(position);
        const word = wordRange ? document.getText(wordRange) : '';
        
        this.outputChannel.appendLine(`[COMPLETION] Word: "${word}" at position ${position.line}:${position.character}`);

        // Get user-defined content from the document first (highest priority)
        try {
            const text = document.getText();
            const lines = text.split('\\n');
            await this.contentResolver.preCacheContent(lines);
            const resolvedContent = this.contentResolver.getCompiledContent(document);
            
            // Add user-defined variables
            for (const variable of resolvedContent.variablesWithDefinitions) {
                if (!word || variable.name.toLowerCase().includes(word.toLowerCase())) {
                    const item = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Variable);
                    item.detail = `Variable = ${variable.definition}`;
                    item.documentation = new vscode.MarkdownString(`**User-defined variable**\\n\\nValue: \`${variable.definition}\``);
                    item.sortText = `0_${variable.name}`; // Sort user-defined content first
                    completionItems.push(item);
                }
            }
            
            // Add user-defined functions
            for (const func of resolvedContent.functionsWithParams) {
                if (!word || func.name.toLowerCase().includes(word.toLowerCase())) {
                    const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
                    const paramStr = func.params.join('; ');
                    item.detail = `Function(${paramStr})`;
                    item.documentation = new vscode.MarkdownString(`**User-defined function**\\n\\nParameters: \`${paramStr}\``);
                    item.insertText = new vscode.SnippetString(`${func.name}(${this.createParameterSnippet(func.params)})`);
                    item.sortText = `0_${func.name}`;
                    completionItems.push(item);
                }
            }
            
            // Add user-defined macros
            for (const macro of resolvedContent.allMacros) {
                if (!word || macro.name.toLowerCase().includes(word.toLowerCase())) {
                    const item = new vscode.CompletionItem(macro.name, vscode.CompletionItemKind.Class);
                    const paramStr = macro.params.join('; ');
                    item.detail = macro.params.length > 0 ? `Macro(${paramStr})` : 'Macro';
                    let docText = `**User-defined macro**`;
                    if (macro.source !== 'local') {
                        docText += `\\n\\nSource: \`${macro.sourceFile || macro.source}\``;
                    }
                    if (macro.params.length > 0) {
                        docText += `\\n\\nParameters: \`${paramStr}\``;
                    }
                    item.documentation = new vscode.MarkdownString(docText);
                    
                    if (macro.params.length > 0) {
                        item.insertText = new vscode.SnippetString(`${macro.name}(${this.createParameterSnippet(macro.params)})`);
                    } else {
                        item.insertText = macro.name;
                    }
                    item.sortText = `0_${macro.name}`;
                    completionItems.push(item);
                }
            }
            
        } catch (error) {
            this.outputChannel.appendLine(`[COMPLETION ERROR] ${error}`);
        }

        // Add built-in content from insert manager
        const allInsertItems = this.insertManager.getAllItems();
        for (const insertItem of allInsertItems) {
            // Filter by search term if provided
            if (!word || this.matchesSearchTerm(insertItem, word)) {
                const completionItem = this.convertInsertItemToCompletionItem(insertItem);
                if (completionItem) {
                    // Sort built-ins after user-defined content
                    completionItem.sortText = `1_${completionItem.label}`;
                    completionItems.push(completionItem);
                }
            }
        }

        this.outputChannel.appendLine(`[COMPLETION] Returning ${completionItems.length} items`);
        return completionItems;
    }

    /**
     * Check if insert item matches the search term
     */
    private matchesSearchTerm(item: InsertItem, searchTerm: string): boolean {
        const term = searchTerm.toLowerCase();
        return (
            item.tag.toLowerCase().includes(term) ||
            (item.label?.toLowerCase().includes(term) ?? false) ||
            item.description.toLowerCase().includes(term) ||
            (item.categoryPath?.toLowerCase().includes(term) ?? false)
        );
    }

    /**
     * Convert an InsertItem to a CompletionItem
     */
    private convertInsertItemToCompletionItem(item: InsertItem): vscode.CompletionItem | null {
        // Determine completion item kind based on content
        let kind = vscode.CompletionItemKind.Text;
        let insertText = item.tag;
        
        // Categorize based on tag content and category path
        if (item.tag.includes('(') || item.categoryPath?.toLowerCase().includes('function')) {
            kind = vscode.CompletionItemKind.Function;
            // Extract function name and create snippet
            const funcMatch = item.tag.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (funcMatch) {
                const funcName = funcMatch[1];
                // Try to extract parameters from the tag
                const paramMatch = item.tag.match(/\\(([^)]*)\\)/);
                if (paramMatch && paramMatch[1].trim()) {
                    const params = paramMatch[1].split(/[;,]/).map(p => p.trim()).filter(p => p);
                    insertText = `${funcName}(${this.createParameterSnippet(params)})`;
                } else {
                    insertText = `${funcName}()`;
                }
            }
        } else if (item.categoryPath?.toLowerCase().includes('constant') || 
                   item.tag.match(/^[A-Za-z_][A-Za-z0-9_]*\\s*=/) ||
                   ['π', 'e', 'φ', 'γ'].includes(item.tag)) {
            kind = vscode.CompletionItemKind.Constant;
            // For constants with assignments, just use the name part
            const constMatch = item.tag.match(/^([A-Za-z_π][A-Za-z0-9_]*)/);
            if (constMatch) {
                insertText = constMatch[1];
            }
        } else if (item.categoryPath?.toLowerCase().includes('operator')) {
            kind = vscode.CompletionItemKind.Operator;
        }

        const completionItem = new vscode.CompletionItem(
            item.label || item.tag,
            kind
        );
        
        completionItem.detail = item.categoryPath || 'Built-in';
        completionItem.documentation = new vscode.MarkdownString(
            `**${item.categoryPath || 'Built-in'}**\\n\\n${item.description}`
        );
        
        // Use snippet string for functions, plain text for others
        if (kind === vscode.CompletionItemKind.Function && insertText.includes('${')) {
            completionItem.insertText = new vscode.SnippetString(insertText);
        } else {
            completionItem.insertText = insertText;
        }

        return completionItem;
    }

    /**
     * Create snippet parameters for function calls
     */
    private createParameterSnippet(params: string[]): string {
        return params.map((param, index) => {
            // Clean up parameter name for display
            let cleanParam = param.trim();
            // Remove $ suffix for display in snippet placeholder
            if (cleanParam.endsWith('$')) {
                cleanParam = cleanParam.slice(0, -1);
            }
            // Remove ? suffix for optional parameters
            if (cleanParam.endsWith('?')) {
                cleanParam = cleanParam.slice(0, -1);
            }
            // Remove type annotations if present (e.g., "x:number" -> "x")
            cleanParam = cleanParam.split(':')[0].trim();
            
            return `\${${index + 1}:${cleanParam}}`;
        }).join('; ');
    }

    /**
     * Register the completion provider
     */
    public static register(settingsManager: CalcpadSettingsManager, outputChannel: vscode.OutputChannel): vscode.Disposable {
        const provider = new CalcpadCompletionProvider(settingsManager, outputChannel);
        return vscode.languages.registerCompletionItemProvider(
            ['calcpad', 'plaintext'], // Language selector
            provider,
            '.', '(', '$' // Trigger characters
        );
    }
}