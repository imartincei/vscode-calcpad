import * as vscode from 'vscode';
import { StagedResolvedContent } from '../calcpadContentResolver';
import { createDiagnosticWithCode, isEmptyOrComment } from './helpers';

/**
 * STAGE 1: Lint raw CPD content (pre-include)
 * Checks:
 * - #include syntax validation
 */
export function lintStage1(
    stage1: StagedResolvedContent['stage1'],
    diagnostics: vscode.Diagnostic[]
): void {
    for (let i = 0; i < stage1.lines.length; i++) {
        const line = stage1.lines[i];
        const originalLineNumber = stage1.sourceMap.get(i) ?? i;

        // Skip empty lines and comments
        if (isEmptyOrComment(line)) {
            continue;
        }

        // Check #include syntax
        if (line.trim().startsWith('#include ')) {
            checkIncludeSyntax(line, originalLineNumber, diagnostics);
        }
    }
}

/**
 * Check #include statement syntax
 * Error codes:
 * - CPD-1101: Malformed #include statement
 * - CPD-1102: Invalid #include file path
 * - CPD-1103: Missing #include filename
 */
function checkIncludeSyntax(
    line: string,
    lineNumber: number,
    diagnostics: vscode.Diagnostic[]
): void {
    const includePattern = /#include\s+([^\s]+)/;
    const match = includePattern.exec(line.trim());

    if (!match) {
        const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Malformed #include statement',
            'CPD-1101',
            vscode.DiagnosticSeverity.Error
        ));
        return;
    }

    const filename = match[1];

    // Check for missing filename
    if (!filename || filename.trim() === '') {
        const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Missing #include filename',
            'CPD-1103',
            vscode.DiagnosticSeverity.Error
        ));
        return;
    }

    // Check for invalid characters in filename (spaces without quotes)
    const cleanFilename = filename.replace(/['"]/g, '');
    if (cleanFilename.includes(' ') && !filename.startsWith('"') && !filename.startsWith("'")) {
        const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Invalid #include file path (use quotes for paths with spaces)',
            'CPD-1102',
            vscode.DiagnosticSeverity.Error
        ));
    }
}
