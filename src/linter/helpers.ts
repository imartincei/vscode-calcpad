import * as vscode from 'vscode';
import { StagedResolvedContent } from '../calcpadContentResolver';
import { DiagnosticWithCode, ParsedLine } from './types';
import { PATTERNS } from './constants';

// Helper to check if line is empty or comment
export function isEmptyOrComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('"') || trimmed.startsWith("'");
}

// Helper to check if line is empty, comment, or directive
export function isEmptyCommentOrDirective(line: string): boolean {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('#');
}

// Helper to split parameters
export function splitParameters(params: string): string[] {
    return params.trim() === '' ? [] : params.split(';').map(p => p.trim()).filter(p => p);
}

// Helper to count parameters
export function countParameters(params: string): number {
    return splitParameters(params).length;
}

// Create diagnostic with error code (both prefix and code property)
export function createDiagnosticWithCode(
    range: vscode.Range,
    message: string,
    code: string,
    severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(
        range,
        `[${code}] ${message}`,
        severity
    ) as DiagnosticWithCode;
    diagnostic.code = code;
    return diagnostic;
}

// Map Stage 2 line number to original document line number
export function mapStage2ToOriginal(
    stage2Line: number,
    stage2ToStage1Map: Map<number, number>,
    stage1ToOriginalMap: Map<number, number>
): number {
    const stage1Line = stage2ToStage1Map.get(stage2Line) ?? stage2Line;
    return stage1ToOriginalMap.get(stage1Line) ?? stage1Line;
}

// Map Stage 3 line number to original document line number
export function mapStage3ToOriginal(
    stage3Line: number,
    stage3ToStage2Map: Map<number, number>,
    stage2ToStage1Map: Map<number, number>,
    stage1ToOriginalMap: Map<number, number>
): number {
    const stage2Line = stage3ToStage2Map.get(stage3Line) ?? stage3Line;
    const stage1Line = stage2ToStage1Map.get(stage2Line) ?? stage2Line;
    return stage1ToOriginalMap.get(stage1Line) ?? stage1Line;
}

// Extract code and string segments from a line
export function extractCodeAndStrings(line: string, lineNumber: number): ParsedLine {
    const codeSegments: Array<{text: string, startPos: number, lineNumber: number}> = [];
    const stringSegments: Array<{text: string, startPos: number, endPos: number, lineNumber: number}> = [];

    let inSingleQuote = false;
    let inDoubleQuote = false;
    let currentSegmentStart = 0;
    let currentSegmentText = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === "'" && !inDoubleQuote) {
            // Handle single quote strings
            if (!inSingleQuote) {
                // Starting a single quote string
                if (currentSegmentText) {
                    codeSegments.push({
                        text: currentSegmentText,
                        startPos: currentSegmentStart,
                        lineNumber
                    });
                }
                inSingleQuote = true;
                currentSegmentStart = i;
                currentSegmentText = char;
            } else {
                // Ending a single quote string
                currentSegmentText += char;
                stringSegments.push({
                    text: currentSegmentText,
                    startPos: currentSegmentStart,
                    endPos: i + 1,
                    lineNumber
                });
                inSingleQuote = false;
                currentSegmentStart = i + 1;
                currentSegmentText = '';
            }
        } else if (char === '"' && !inSingleQuote) {
            // Handle double quote strings
            if (!inDoubleQuote) {
                // Starting a double quote string
                if (currentSegmentText) {
                    codeSegments.push({
                        text: currentSegmentText,
                        startPos: currentSegmentStart,
                        lineNumber
                    });
                }
                inDoubleQuote = true;
                currentSegmentStart = i;
                currentSegmentText = char;
            } else {
                // Ending a double quote string
                currentSegmentText += char;
                stringSegments.push({
                    text: currentSegmentText,
                    startPos: currentSegmentStart,
                    endPos: i + 1,
                    lineNumber
                });
                inDoubleQuote = false;
                currentSegmentStart = i + 1;
                currentSegmentText = '';
            }
        } else {
            currentSegmentText += char;
        }
    }

    // Handle remaining segment
    if (currentSegmentText && !inSingleQuote && !inDoubleQuote) {
        codeSegments.push({
            text: currentSegmentText,
            startPos: currentSegmentStart,
            lineNumber
        });
    }

    return {
        codeSegments,
        stringSegments,
        lineNumber,
        originalLine: line
    };
}

// Find the range of a macro call in a line
export function findMacroCallRange(macroCall: string, lineNumber: number): vscode.Range {
    // Find the macro name (ends with $)
    const macroNameMatch = PATTERNS.macroName.exec(macroCall);
    if (macroNameMatch) {
        const macroName = macroNameMatch[1];
        // Highlight the entire macro call
        return new vscode.Range(lineNumber, 0, lineNumber, macroCall.length);
    }
    // Fallback: highlight the entire line
    return new vscode.Range(lineNumber, 0, lineNumber, 999);
}

// Calculate Levenshtein distance for suggestions
export function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; i <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// Find suggestions for an undefined identifier
export function findSuggestions(
    identifier: string,
    availableIdentifiers: string[],
    maxDistance: number
): string[] {
    const suggestions: Array<{name: string, distance: number}> = [];

    for (const available of availableIdentifiers) {
        const distance = levenshteinDistance(identifier.toLowerCase(), available.toLowerCase());
        if (distance <= maxDistance) {
            suggestions.push({name: available, distance});
        }
    }

    // Sort by distance, then alphabetically
    suggestions.sort((a, b) => {
        if (a.distance !== b.distance) {
            return a.distance - b.distance;
        }
        return a.name.localeCompare(b.name);
    });

    return suggestions.slice(0, 3).map(s => s.name);
}
