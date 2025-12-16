import * as vscode from 'vscode';
import { ParsedLine, DefinitionCollector } from '../types';
import { createDiagnosticWithCode } from '../helpers';
import { PATTERNS, OPERATORS, ASSIGNMENT_OPERATORS, VALID_HASH_KEYWORDS } from '../constants';

/**
 * Check operator syntax
 * Error codes:
 * - CPD-3401: Invalid operator usage
 * - CPD-3402: Mismatched operator
 */
export function checkOperatorSyntax(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    for (const segment of parsedLine.codeSegments) {
        // Check for double operators (e.g., "++", "**", "//")
        const doubleOpPattern = /([+\-*/%^])\1/g;
        const doubleOpMatches = segment.text.matchAll(doubleOpPattern);

        for (const match of doubleOpMatches) {
            const range = new vscode.Range(
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0),
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0) + match[0].length
            );

            diagnostics.push(createDiagnosticWithCode(
                range,
                `Invalid operator '${match[0]}'`,
                'CPD-3401',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for invalid operator combinations
        const invalidOpPattern = /[+\-*/%^]{3,}/g;
        const invalidOpMatches = segment.text.matchAll(invalidOpPattern);

        for (const match of invalidOpMatches) {
            const range = new vscode.Range(
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0),
                parsedLine.lineNumber,
                segment.startPos + (match.index ?? 0) + match[0].length
            );

            diagnostics.push(createDiagnosticWithCode(
                range,
                `Invalid operator sequence '${match[0]}'`,
                'CPD-3401',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}

/**
 * Check command usage
 * Error code: CPD-3403
 */
export function checkCommandUsage(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    const commands = collector.getCommands();

    for (const segment of parsedLine.codeSegments) {
        const matches = segment.text.matchAll(PATTERNS.identifier);

        for (const match of matches) {
            if (!match[1]) continue;
            const identifier = match[1];

            // Check if it's a command
            if (commands.has(identifier)) {
                // Commands should be at the start of a line or after whitespace
                const precedingText = segment.text.substring(0, match.index ?? 0).trim();
                if (precedingText !== '') {
                    const range = new vscode.Range(
                        parsedLine.lineNumber,
                        segment.startPos + (match.index ?? 0),
                        parsedLine.lineNumber,
                        segment.startPos + (match.index ?? 0) + identifier.length
                    );

                    diagnostics.push(createDiagnosticWithCode(
                        range,
                        `Command '${identifier}' must be at the start of a statement`,
                        'CPD-3403',
                        vscode.DiagnosticSeverity.Warning
                    ));
                }
            }
        }
    }
}

/**
 * Validate command patterns
 * Error code: CPD-3404
 */
export function validateCommandPatterns(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    const line = parsedLine.originalLine.trim();

    // Check for common command patterns
    if (line.startsWith('input ')) {
        // input command should have format: input variable
        const inputPattern = /^input\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;
        if (!inputPattern.test(line)) {
            const range = new vscode.Range(parsedLine.lineNumber, 0, parsedLine.lineNumber, line.length);
            diagnostics.push(createDiagnosticWithCode(
                range,
                'Invalid input command syntax (expected: input variable_name)',
                'CPD-3404',
                vscode.DiagnosticSeverity.Error
            ));
        }
    } else if (line.startsWith('print ') || line.startsWith('show ')) {
        // These commands are more flexible - just ensure something follows
        const printPattern = /^(print|show)\s+.+/;
        if (!printPattern.test(line)) {
            const range = new vscode.Range(parsedLine.lineNumber, 0, parsedLine.lineNumber, line.length);
            diagnostics.push(createDiagnosticWithCode(
                range,
                'Invalid command syntax (expected expression after command)',
                'CPD-3404',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}

/**
 * Check control structures
 * Error code: CPD-3405
 */
export function checkControlStructures(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    const line = parsedLine.originalLine.trim();

    // Check #if syntax
    if (line.startsWith('#if ')) {
        const ifPattern = /#if\s+.+/;
        if (!ifPattern.test(line)) {
            const range = new vscode.Range(parsedLine.lineNumber, 0, parsedLine.lineNumber, line.length);
            diagnostics.push(createDiagnosticWithCode(
                range,
                'Invalid #if syntax (expected: #if condition)',
                'CPD-3405',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    // Check #for syntax
    if (line.startsWith('#for ')) {
        const forPattern = /#for\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*.+/;
        if (!forPattern.test(line)) {
            const range = new vscode.Range(parsedLine.lineNumber, 0, parsedLine.lineNumber, line.length);
            diagnostics.push(createDiagnosticWithCode(
                range,
                'Invalid #for syntax (expected: #for variable = range)',
                'CPD-3405',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    // Check #while syntax
    if (line.startsWith('#while ')) {
        const whilePattern = /#while\s+.+/;
        if (!whilePattern.test(line)) {
            const range = new vscode.Range(parsedLine.lineNumber, 0, parsedLine.lineNumber, line.length);
            diagnostics.push(createDiagnosticWithCode(
                range,
                'Invalid #while syntax (expected: #while condition)',
                'CPD-3405',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}

/**
 * Check keyword validation
 * Error code: CPD-3406
 */
export function checkKeywordValidation(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    const line = parsedLine.originalLine.trim();

    // Check for hash keywords
    if (line.startsWith('#')) {
        const hashKeyword = line.split(/\s+/)[0];

        if (!VALID_HASH_KEYWORDS.has(hashKeyword)) {
            const range = new vscode.Range(parsedLine.lineNumber, 0, parsedLine.lineNumber, hashKeyword.length);
            diagnostics.push(createDiagnosticWithCode(
                range,
                `Unknown directive '${hashKeyword}'`,
                'CPD-3406',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }
}

/**
 * Check assignment syntax
 * Error code: CPD-3407
 */
export function checkAssignments(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    for (const segment of parsedLine.codeSegments) {
        // Check for invalid assignment patterns
        // Pattern: = without left-hand side
        if (segment.text.trim().startsWith('=')) {
            const range = new vscode.Range(
                parsedLine.lineNumber,
                segment.startPos,
                parsedLine.lineNumber,
                segment.startPos + segment.text.length
            );

            diagnostics.push(createDiagnosticWithCode(
                range,
                'Assignment requires left-hand side',
                'CPD-3407',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for multiple assignments on same line (not allowed in CalcPad)
        const assignmentMatches = segment.text.match(/=/g);
        if (assignmentMatches && assignmentMatches.length > 1) {
            // Check if they're comparison operators (==, !=, <=, >=)
            const comparisonPattern = /[=!<>]=/g;
            const comparisonMatches = segment.text.match(comparisonPattern);
            const comparisonCount = comparisonMatches ? comparisonMatches.length : 0;

            // If more assignments than comparisons, it's an error
            if (assignmentMatches.length > comparisonCount + 1) {
                const range = new vscode.Range(
                    parsedLine.lineNumber,
                    segment.startPos,
                    parsedLine.lineNumber,
                    segment.startPos + segment.text.length
                );

                diagnostics.push(createDiagnosticWithCode(
                    range,
                    'Multiple assignments on same line not allowed',
                    'CPD-3407',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }
}

/**
 * Check units in expressions
 * Error code: CPD-3408
 */
export function checkUnitsInExpressions(
    parsedLine: ParsedLine,
    collector: DefinitionCollector,
    diagnostics: vscode.Diagnostic[]
): void {
    // This is a placeholder for unit checking
    // CalcPad has complex unit handling that would require significant work
    // For now, we just check for basic issues

    const customUnits = collector.getAllCustomUnits();

    for (const segment of parsedLine.codeSegments) {
        // Check for unit definitions (CustomUnit statement)
        if (segment.text.trim().startsWith('CustomUnit')) {
            const unitDefPattern = /CustomUnit\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*.+/;
            if (!unitDefPattern.test(segment.text)) {
                const range = new vscode.Range(
                    parsedLine.lineNumber,
                    segment.startPos,
                    parsedLine.lineNumber,
                    segment.startPos + segment.text.length
                );

                diagnostics.push(createDiagnosticWithCode(
                    range,
                    'Invalid CustomUnit syntax (expected: CustomUnit name = definition)',
                    'CPD-3408',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }
}
