import * as vscode from 'vscode';
import { ParsedLine, DefinitionCollector } from '../types';
import { createDiagnosticWithCode, findSuggestions, countParameters } from '../helpers';
import { PATTERNS } from '../constants';

/**
 * Check for undefined variables
 * Error code: CPD-3301
 */
export function checkUndefinedVariables(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    const allVariables = collector.getAllVariables();
    const allFunctions = collector.getAllFunctions();
    const allMacros = collector.getAllMacros();
    const builtInFunctions = collector.getBuiltInFunctions();
    const controlKeywords = collector.getControlKeywords();
    const commands = collector.getCommands();
    const customUnits = collector.getAllCustomUnits();

    for (const segment of parsedLine.codeSegments) {
        const matches = segment.text.matchAll(PATTERNS.identifier);

        for (const match of matches) {
            if (!match[1]) continue;
            const identifier = match[1];

            // Skip macros (end with $)
            if (identifier.endsWith('$')) {
                if (!allMacros.has(identifier)) {
                    const range = new vscode.Range(
                        parsedLine.lineNumber,
                        segment.startPos + (match.index ?? 0),
                        parsedLine.lineNumber,
                        segment.startPos + (match.index ?? 0) + identifier.length
                    );

                    const suggestions = findSuggestions(
                        identifier,
                        Array.from(allMacros.keys()),
                        3
                    );

                    let message = `Undefined macro '${identifier}'`;
                    if (suggestions.length > 0) {
                        message += `. Did you mean: ${suggestions.join(', ')}?`;
                    }

                    diagnostics.push(createDiagnosticWithCode(
                        range,
                        message,
                        'CPD-3303',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                continue;
            }

            // Skip if it's a built-in function
            if (builtInFunctions.has(identifier.toLowerCase())) {
                continue;
            }

            // Skip if it's a user-defined function
            if (allFunctions.has(identifier)) {
                continue;
            }

            // Skip if it's a control keyword
            if (controlKeywords.has(identifier)) {
                continue;
            }

            // Skip if it's a command
            if (commands.has(identifier)) {
                continue;
            }

            // Skip if it's a custom unit
            if (customUnits.has(identifier)) {
                continue;
            }

            // Skip if it's a defined variable
            if (allVariables.has(identifier)) {
                continue;
            }

            // Check if preceded by $ (means it's a function/macro call being checked above)
            const precedingChar = match.index && match.index > 0
                ? segment.text[match.index - 1]
                : '';
            if (precedingChar === '$') {
                continue;
            }

            // Undefined variable - generate suggestions
            const range = new vscode.Range(
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0),
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0) + identifier.length
            );

            const allIdentifiers = [
                ...Array.from(allVariables),
                ...Array.from(allFunctions.keys()),
                ...Array.from(builtInFunctions)
            ];

            const suggestions = findSuggestions(identifier, allIdentifiers, 3);

            let message = `Undefined variable '${identifier}'`;
            if (suggestions.length > 0) {
                message += `. Did you mean: ${suggestions.join(', ')}?`;
            }

            diagnostics.push(createDiagnosticWithCode(
                range,
                message,
                'CPD-3301',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}

/**
 * Check function usage (parameter count)
 * Error code: CPD-3302
 */
export function checkFunctionUsage(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    const allFunctions = collector.getAllFunctions();
    const builtInFunctions = collector.getBuiltInFunctions();

    // Pattern: functionName(params)
    const functionCallPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;

    for (const segment of parsedLine.codeSegments) {
        const matches = segment.text.matchAll(functionCallPattern);

        for (const match of matches) {
            const funcName = match[1];
            const paramsStr = match[2];

            // Skip built-in functions (they have variable param counts)
            if (builtInFunctions.has(funcName.toLowerCase())) {
                continue;
            }

            // Check user-defined functions
            if (allFunctions.has(funcName)) {
                const expectedParamCount = allFunctions.get(funcName) ?? 0;
                const actualParamCount = countParameters(paramsStr);

                if (actualParamCount !== expectedParamCount) {
                    const range = new vscode.Range(
                        parsedLine.lineNumber,
                        segment.startPos + (match.index ?? 0),
                        parsedLine.lineNumber,
                        segment.startPos + (match.index ?? 0) + match[0].length
                    );

                    diagnostics.push(createDiagnosticWithCode(
                        range,
                        `Function '${funcName}' expects ${expectedParamCount} parameter(s) but got ${actualParamCount}`,
                        'CPD-3302',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
    }
}

/**
 * Check macro usage (parameter count)
 * Error codes:
 * - CPD-3303: Undefined macro
 * - CPD-3304: Incorrect macro parameter count
 */
export function checkMacroUsage(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    const allMacros = collector.getAllMacros();

    // Pattern: macroName$(params) or just macroName$
    const macroCallPattern = /([a-zA-Z_][a-zA-Z0-9_]*\$)(?:\(([^)]*)\))?/g;

    for (const segment of parsedLine.codeSegments) {
        const matches = segment.text.matchAll(macroCallPattern);

        for (const match of matches) {
            const macroName = match[1];
            const paramsStr = match[2] || '';

            if (!allMacros.has(macroName)) {
                // Already handled in checkUndefinedVariables
                continue;
            }

            const expectedParamCount = allMacros.get(macroName) ?? 0;
            const actualParamCount = paramsStr ? countParameters(paramsStr) : 0;

            if (actualParamCount !== expectedParamCount) {
                const range = new vscode.Range(
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0),
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0) + match[0].length
                );

                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Macro '${macroName}' expects ${expectedParamCount} parameter(s) but got ${actualParamCount}`,
                    'CPD-3304',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }
}

/**
 * Check unit usage
 * Error code: CPD-3305
 */
export function checkUnitUsage(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    const customUnits = collector.getAllCustomUnits();

    // Pattern: number followed by unit (e.g., "10m", "5.5kg")
    // This is a basic check - CalcPad has complex unit handling
    const unitPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;

    for (const segment of parsedLine.codeSegments) {
        const matches = segment.text.matchAll(unitPattern);

        for (const match of matches) {
            const possibleUnit = match[2];

            // Skip if it's a defined variable or function
            if (collector.getAllVariables().has(possibleUnit)) {
                continue;
            }
            if (collector.getAllFunctions().has(possibleUnit)) {
                continue;
            }
            if (collector.getBuiltInFunctions().has(possibleUnit.toLowerCase())) {
                continue;
            }

            // Check if it's a custom unit
            if (!customUnits.has(possibleUnit)) {
                // This might be a built-in unit or multiplication
                // Skip for now - this is complex to validate
                continue;
            }
        }
    }
}
