import * as vscode from 'vscode';
import { CalcpadDefinitionsService } from './calcpadDefinitionsService';

/**
 * Provides "Go to Definition" functionality for CalcPad functions, macros, and variables.
 */
export class CalcpadDefinitionProvider implements vscode.DefinitionProvider {
    private definitionsService: CalcpadDefinitionsService;
    private outputChannel: vscode.OutputChannel;

    constructor(definitionsService: CalcpadDefinitionsService, outputChannel: vscode.OutputChannel) {
        this.definitionsService = definitionsService;
        this.outputChannel = outputChannel;
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | null> {
        // Get the word at the current position
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!wordRange) {
            return null;
        }

        const word = document.getText(wordRange);
        if (!word) {
            return null;
        }

        this.outputChannel.appendLine('[Definition] Looking for definition of: ' + word);

        // Get cached definitions for this document
        const definitions = this.definitionsService.getCachedDefinitions(document.uri.toString());
        if (!definitions) {
            this.outputChannel.appendLine('[Definition] No cached definitions for document');
            return null;
        }

        // Search in macros
        for (const macro of definitions.macros) {
            if (macro.name === word || macro.name === word + '$') {
                this.outputChannel.appendLine('[Definition] Found macro: ' + macro.name + ' at line ' + macro.lineNumber);
                return this.createLocation(document, macro.lineNumber, macro.sourceFile);
            }
        }

        // Search in functions
        for (const func of definitions.functions) {
            if (func.name === word) {
                this.outputChannel.appendLine('[Definition] Found function: ' + func.name + ' at line ' + func.lineNumber);
                return this.createLocation(document, func.lineNumber, func.sourceFile);
            }
        }

        // Search in variables
        for (const variable of definitions.variables) {
            if (variable.name === word) {
                this.outputChannel.appendLine('[Definition] Found variable: ' + variable.name + ' at line ' + variable.lineNumber);
                return this.createLocation(document, variable.lineNumber, variable.sourceFile);
            }
        }

        // Search in custom units
        for (const unit of definitions.customUnits) {
            if (unit.name === word) {
                this.outputChannel.appendLine('[Definition] Found custom unit: ' + unit.name + ' at line ' + unit.lineNumber);
                return this.createLocation(document, unit.lineNumber, unit.sourceFile);
            }
        }

        this.outputChannel.appendLine('[Definition] No definition found for: ' + word);
        return null;
    }

    private async createLocation(
        document: vscode.TextDocument,
        lineNumber: number,
        sourceFile?: string
    ): Promise<vscode.Location> {
        // lineNumber from server is 0-based, same as VS Code
        const line = Math.max(0, lineNumber);

        if (sourceFile && sourceFile !== 'local') {
            // Definition is in an included file - search for it in workspace
            const pattern = '**/' + sourceFile;
            const foundFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);

            if (foundFiles.length > 0) {
                const targetUri = foundFiles[0];
                this.outputChannel.appendLine('[Definition] Found source file: ' + targetUri.fsPath);
                return new vscode.Location(targetUri, new vscode.Position(line, 0));
            } else {
                this.outputChannel.appendLine('[Definition] Source file not found in workspace: ' + sourceFile);
                // Fall back to current document
                return new vscode.Location(document.uri, new vscode.Position(line, 0));
            }
        }

        // Definition is in the current document
        return new vscode.Location(document.uri, new vscode.Position(line, 0));
    }

    /**
     * Register the definition provider.
     */
    static register(
        definitionsService: CalcpadDefinitionsService,
        outputChannel: vscode.OutputChannel
    ): vscode.Disposable {
        const provider = new CalcpadDefinitionProvider(definitionsService, outputChannel);
        return vscode.languages.registerDefinitionProvider(
            { language: 'calcpad' },
            provider
        );
    }
}
