import * as vscode from 'vscode';
import { ParsedLine } from '../types';
import { createDiagnosticWithCode } from '../helpers';

/**
 * Check parentheses balance
 * Error codes:
 * - CPD-3101: Unmatched opening parenthesis
 * - CPD-3102: Unmatched closing parenthesis
 */
export function checkParenthesesBalance(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    let openCount = 0;
    let lastOpenPos = -1;

    for (const segment of parsedLine.codeSegments) {
        for (let i = 0; i < segment.text.length; i++) {
            const char = segment.text[i];
            if (char === '(') {
                openCount++;
                if (openCount === 1) {
                    lastOpenPos = segment.startPos + i;
                }
            } else if (char === ')') {
                openCount--;
                if (openCount < 0) {
                    const range = new vscode.Range(
                        parsedLine.lineNumber,
                        segment.startPos + i,
                        parsedLine.lineNumber,
                        segment.startPos + i + 1
                    );
                    diagnostics.push(createDiagnosticWithCode(
                        range,
                        'Unmatched closing parenthesis',
                        'CPD-3102',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }
            }
        }
    }

    if (openCount > 0 && lastOpenPos >= 0) {
        const range = new vscode.Range(
            parsedLine.lineNumber,
            lastOpenPos,
            parsedLine.lineNumber,
            lastOpenPos + 1
        );
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Unmatched opening parenthesis',
            'CPD-3101',
            vscode.DiagnosticSeverity.Error
        ));
    }
}

/**
 * Check bracket balance
 * Error codes:
 * - CPD-3103: Unmatched opening square bracket
 * - CPD-3104: Unmatched closing square bracket
 * - CPD-3105: Unmatched opening curly brace
 * - CPD-3106: Unmatched closing curly brace
 */
export function checkBracketBalance(
    parsedLine: ParsedLine,
    diagnostics: vscode.Diagnostic[]
): void {
    let squareBracketCount = 0;
    let curlyBraceCount = 0;
    let lastSquareOpenPos = -1;
    let lastCurlyOpenPos = -1;

    for (const segment of parsedLine.codeSegments) {
        for (let i = 0; i < segment.text.length; i++) {
            const char = segment.text[i];
            const pos = segment.startPos + i;

            if (char === '[') {
                squareBracketCount++;
                if (squareBracketCount === 1) {
                    lastSquareOpenPos = pos;
                }
            } else if (char === ']') {
                squareBracketCount--;
                if (squareBracketCount < 0) {
                    const range = new vscode.Range(
                        parsedLine.lineNumber,
                        pos,
                        parsedLine.lineNumber,
                        pos + 1
                    );
                    diagnostics.push(createDiagnosticWithCode(
                        range,
                        'Unmatched closing square bracket',
                        'CPD-3104',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }
            } else if (char === '{') {
                curlyBraceCount++;
                if (curlyBraceCount === 1) {
                    lastCurlyOpenPos = pos;
                }
            } else if (char === '}') {
                curlyBraceCount--;
                if (curlyBraceCount < 0) {
                    const range = new vscode.Range(
                        parsedLine.lineNumber,
                        pos,
                        parsedLine.lineNumber,
                        pos + 1
                    );
                    diagnostics.push(createDiagnosticWithCode(
                        range,
                        'Unmatched closing curly brace',
                        'CPD-3106',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }
            }
        }
    }

    if (squareBracketCount > 0 && lastSquareOpenPos >= 0) {
        const range = new vscode.Range(
            parsedLine.lineNumber,
            lastSquareOpenPos,
            parsedLine.lineNumber,
            lastSquareOpenPos + 1
        );
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Unmatched opening square bracket',
            'CPD-3103',
            vscode.DiagnosticSeverity.Error
        ));
    }

    if (curlyBraceCount > 0 && lastCurlyOpenPos >= 0) {
        const range = new vscode.Range(
            parsedLine.lineNumber,
            lastCurlyOpenPos,
            parsedLine.lineNumber,
            lastCurlyOpenPos + 1
        );
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Unmatched opening curly brace',
            'CPD-3105',
            vscode.DiagnosticSeverity.Error
        ));
    }
}

/**
 * Check control block balance
 * Error code: CPD-3105 (reusing bracket code for consistency)
 * Note: This now runs on Stage 3 (after macros are expanded) to handle macros containing control blocks
 *
 * Control block syntax in CalcPad:
 * - #if ... #end if
 * - #repeat ... #loop
 * - #for ... #loop
 * - #while ... #loop
 * - #def ... #end def
 */
export function checkControlBlockBalance(
    lines: string[],
    diagnostics: vscode.Diagnostic[]
): void {
    const stack: Array<{keyword: string, lineNumber: number}> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // #if block
        if (line.startsWith('#if ')) {
            stack.push({keyword: 'if', lineNumber: i});
        } else if (line === '#end if') {
            if (stack.length === 0 || stack[stack.length - 1].keyword !== 'if') {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    '#end if without matching #if',
                    'CPD-3105',
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                stack.pop();
            }
        }
        // #repeat block
        else if (line === '#repeat' || line.startsWith('#repeat ')) {
            stack.push({keyword: 'repeat', lineNumber: i});
        }
        // #for block
        else if (line.startsWith('#for ')) {
            stack.push({keyword: 'for', lineNumber: i});
        }
        // #while block
        else if (line.startsWith('#while ')) {
            stack.push({keyword: 'while', lineNumber: i});
        }
        // #loop closes #repeat, #for, or #while
        else if (line === '#loop') {
            const top = stack.length > 0 ? stack[stack.length - 1].keyword : null;
            if (!top || (top !== 'repeat' && top !== 'for' && top !== 'while')) {
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    '#loop without matching #repeat, #for, or #while',
                    'CPD-3105',
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                stack.pop();
            }
        }
        // #def block
        else if (line.startsWith('#def ')) {
            stack.push({keyword: 'def', lineNumber: i});
        } else if (line === '#end def') {
            if (stack.length === 0 || stack[stack.length - 1].keyword !== 'def') {
                // This should be caught in Stage 2, but check here as well for safety
                const range = new vscode.Range(i, 0, i, line.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    '#end def without matching #def',
                    'CPD-3105',
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                stack.pop();
            }
        }
    }

    // Check for unclosed blocks
    for (const block of stack) {
        const range = new vscode.Range(block.lineNumber, 0, block.lineNumber, 999);
        let endKeyword = '';
        if (block.keyword === 'if') {
            endKeyword = '#end if';
        } else if (block.keyword === 'repeat' || block.keyword === 'for' || block.keyword === 'while') {
            endKeyword = '#loop';
        } else if (block.keyword === 'def') {
            endKeyword = '#end def';
        }

        diagnostics.push(createDiagnosticWithCode(
            range,
            `Unclosed #${block.keyword} block (expected ${endKeyword})`,
            'CPD-3105',
            vscode.DiagnosticSeverity.Error
        ));
    }
}
