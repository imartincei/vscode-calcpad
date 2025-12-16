import * as vscode from 'vscode';
import { ParsedLine, DefinitionCollector } from '../types';
import { createDiagnosticWithCode } from '../helpers';
import { PATTERNS } from '../constants';

/**
 * Check variable naming conventions
 * Error codes:
 * - CPD-3201: Invalid variable name (doesn't start with letter/underscore)
 * - CPD-3202: Variable name conflicts with built-in function
 * - CPD-3205: Variable name conflicts with keyword
 */
export function checkVariableNaming(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    for (const segment of parsedLine.codeSegments) {
        const matches = segment.text.matchAll(PATTERNS.identifier);

        for (const match of matches) {
            if (!match[1]) continue;
            const identifier = match[1];

            // Skip if it's a built-in function
            if (collector.getBuiltInFunctions().has(identifier.toLowerCase())) {
                continue;
            }

            // Skip if it's a control keyword
            if (collector.getControlKeywords().has(identifier)) {
                continue;
            }

            // Skip if it's a command
            if (collector.getCommands().has(identifier)) {
                continue;
            }

            // Skip if it's a macro (ends with $)
            if (identifier.endsWith('$')) {
                continue;
            }

            // Check if starts with valid character (letter or underscore)
            if (!/^[a-zA-Z_]/.test(identifier)) {
                const range = new vscode.Range(
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0),
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0) + identifier.length
                );
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Invalid variable name '${identifier}' (must start with letter or underscore)`,
                    'CPD-3201',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Check for conflict with built-in function (case-insensitive)
            if (collector.getBuiltInFunctions().has(identifier.toLowerCase())) {
                const range = new vscode.Range(
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0),
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0) + identifier.length
                );
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Variable name '${identifier}' conflicts with built-in function`,
                    'CPD-3202',
                    vscode.DiagnosticSeverity.Error
                ));
            }

            // Check for conflict with keyword
            if (collector.getControlKeywords().has(identifier)) {
                const range = new vscode.Range(
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0),
                    parsedLine.lineNumber,
                    segment.startPos + (match.index ?? 0) + identifier.length
                );
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Variable name '${identifier}' conflicts with keyword`,
                    'CPD-3205',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }
}

/**
 * Check function definition syntax
 * Error codes:
 * - CPD-3203: Invalid function name
 * - CPD-3204: Function name conflicts with built-in
 */
export function checkFunctionDefinition(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    // Pattern: identifier(params) = expression
    const functionDefPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*=/;

    for (const segment of parsedLine.codeSegments) {
        const match = functionDefPattern.exec(segment.text);
        if (!match) continue;

        const funcName = match[1];

        // Check if function name starts with letter/underscore
        if (!/^[a-zA-Z_]/.test(funcName)) {
            const range = new vscode.Range(
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0),
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0) + funcName.length
            );
            diagnostics.push(createDiagnosticWithCode(
                range,
                `Invalid function name '${funcName}' (must start with letter or underscore)`,
                'CPD-3203',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for conflict with built-in function
        if (collector.getBuiltInFunctions().has(funcName.toLowerCase())) {
            const range = new vscode.Range(
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0),
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0) + funcName.length
            );
            diagnostics.push(createDiagnosticWithCode(
                range,
                `Function name '${funcName}' conflicts with built-in function`,
                'CPD-3204',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}
