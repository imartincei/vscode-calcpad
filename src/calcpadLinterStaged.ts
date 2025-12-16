import * as vscode from 'vscode';
import { CalcpadContentResolver } from './calcpadContentResolver';
import { CalcpadSettingsManager } from './calcpadSettings';
import { DefinitionCollector } from './linter/types';
import { extractCodeAndStrings } from './linter/helpers';
import { lintStage1 } from './linter/stage1';
import { lintStage2 } from './linter/stage2';
import {
    checkParenthesesBalance,
    checkBracketBalance,
    checkControlBlockBalance,
    checkVariableNaming,
    checkFunctionDefinition,
    checkUndefinedVariables,
    checkFunctionUsage,
    checkMacroUsage,
    checkUnitUsage,
    checkOperatorSyntax,
    checkCommandUsage,
    validateCommandPatterns,
    checkControlStructures,
    checkKeywordValidation,
    checkAssignments,
    checkUnitsInExpressions
} from './linter/stage3';

/**
 * Three-stage CalcPad linter
 *
 * Stage 1: Lint raw CPD content (check #include syntax)
 * Stage 2: Lint post-include, pre-macro (check macro definitions)
 * Stage 3: Lint fully expanded code (all other checks)
 */
export class CalcpadLinterStaged {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    private contentResolver: CalcpadContentResolver;

    constructor(settingsManager: CalcpadSettingsManager) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('calcpad');
        this.outputChannel = vscode.window.createOutputChannel('CalcPad Linter Debug');
        this.contentResolver = new CalcpadContentResolver(settingsManager, this.outputChannel);
    }

    public getContentResolver(): CalcpadContentResolver {
        return this.contentResolver;
    }

    /**
     * Main entry point for linting a document
     */
    public async lintDocument(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Pre-cache all included content before linting
        await this.contentResolver.preCacheContent(lines);

        // Get staged content (all three stages)
        const stagedContent = this.contentResolver.getStagedContent(document);

        // Run Stage 1 linting (raw content - #include syntax)
        lintStage1(stagedContent.stage1, diagnostics);

        // Run Stage 2 linting (post-include, pre-macro - macro definitions)
        lintStage2(stagedContent.stage1, stagedContent.stage2, diagnostics);

        // Run Stage 3 linting (fully expanded - all other checks)
        this.lintStage3(stagedContent, diagnostics);

        // Set diagnostics
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Stage 3 linting - runs on fully expanded code
     */
    private lintStage3(
        stagedContent: any,
        diagnostics: vscode.Diagnostic[]
    ): void {
        const stage3 = stagedContent.stage3;

        // Create definition collector
        const collector = this.createDefinitionCollector(
            stage3.userDefinedFunctions,
            stage3.functionsWithParams,
            stage3.userDefinedMacros,
            stage3.definedVariables,
            stage3.customUnits
        );

        // Check control block balance (runs on Stage 3 to handle macros containing blocks)
        checkControlBlockBalance(stage3.lines, diagnostics);

        // Lint each line
        for (let i = 0; i < stage3.lines.length; i++) {
            const line = stage3.lines[i];
            const parsedLine = extractCodeAndStrings(line, i);

            // Skip empty lines and comments
            if (line.trim() === '' || line.trim().startsWith('"') || line.trim().startsWith("'")) {
                continue;
            }

            // Skip directive lines for most checks
            if (line.trim().startsWith('#')) {
                // Still check control structures
                checkControlStructures(parsedLine, diagnostics);
                checkKeywordValidation(parsedLine, diagnostics);
                continue;
            }

            // Run all Stage 3 checks
            // Balance checks
            checkParenthesesBalance(parsedLine, diagnostics);
            checkBracketBalance(parsedLine, diagnostics);

            // Naming checks
            checkVariableNaming(parsedLine, collector, diagnostics);
            checkFunctionDefinition(parsedLine, collector, diagnostics);

            // Usage checks
            checkUndefinedVariables(parsedLine, collector, diagnostics);
            checkFunctionUsage(parsedLine, collector, diagnostics);
            checkMacroUsage(parsedLine, collector, diagnostics);
            checkUnitUsage(parsedLine, collector, diagnostics);

            // Semantic checks
            checkOperatorSyntax(parsedLine, diagnostics);
            checkCommandUsage(parsedLine, collector, diagnostics);
            validateCommandPatterns(parsedLine, diagnostics);
            checkAssignments(parsedLine, diagnostics);
            checkUnitsInExpressions(parsedLine, collector, diagnostics);
        }
    }

    /**
     * Create definition collector from Stage 3 data
     */
    private createDefinitionCollector(
        userDefinedFunctions: Map<string, number>,
        functionsWithParams: any[],
        userDefinedMacros: Map<string, {lineNumber: number, paramCount: number}>,
        definedVariables: Set<string>,
        customUnits: any[]
    ): DefinitionCollector {
        // Convert macros to parameter count map
        const macros = new Map<string, number>();
        for (const [name, info] of userDefinedMacros) {
            macros.set(name, info.paramCount);
        }

        // Convert custom units to set
        const customUnitNames = new Set<string>();
        for (const unit of customUnits) {
            customUnitNames.add(unit.name);
        }

        // Import constants from linter/constants
        const { BUILT_IN_FUNCTIONS, CONTROL_KEYWORDS, COMMANDS, VALID_HASH_KEYWORDS } = require('./linter/constants');

        return {
            getAllVariables: () => definedVariables,
            getAllFunctions: () => userDefinedFunctions,
            getAllMacros: () => macros,
            getAllCustomUnits: () => customUnitNames,
            getBuiltInFunctions: () => BUILT_IN_FUNCTIONS,
            getControlKeywords: () => CONTROL_KEYWORDS,
            getCommands: () => COMMANDS,
            getValidHashKeywords: () => VALID_HASH_KEYWORDS
        };
    }

    /**
     * Clear diagnostics for a document
     */
    public clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.diagnosticCollection.clear();
    }
}
