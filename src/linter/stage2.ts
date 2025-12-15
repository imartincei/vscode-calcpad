import * as vscode from 'vscode';
import { StagedResolvedContent } from '../calcpadContentResolver';
import { createDiagnosticWithCode, mapStage2ToOriginal, splitParameters } from './helpers';

/**
 * STAGE 2: Lint post-include, pre-macro content
 * Checks:
 * - Duplicate macro definitions
 * - Macro naming conventions ($ suffix)
 * - Macro definition syntax
 * - Nested macro definitions
 * - Macro definitions inside control blocks
 */
export function lintStage2(
    stage1: StagedResolvedContent['stage1'],
    stage2: StagedResolvedContent['stage2'],
    diagnostics: vscode.Diagnostic[]
): void {
    // Report duplicate macro errors
    for (const duplicate of stage2.duplicateMacros) {
        const originalLineNumber = mapStage2ToOriginal(
            duplicate.duplicateLineNumber,
            stage2.sourceMap,
            stage1.sourceMap
        );
        const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, 999);
        diagnostics.push(createDiagnosticWithCode(
            range,
            `Duplicate macro definition: '${duplicate.name}' is already defined at line ${duplicate.originalLineNumber + 1}`,
            'CPD-2201',
            vscode.DiagnosticSeverity.Error
        ));
    }

    // Track macro definition nesting
    let inMacroDefinition = false;
    let macroDefStartLine = -1;

    // Track control block depth
    const controlBlockStack: string[] = [];

    // Check all macro definitions for syntax issues
    for (let i = 0; i < stage2.lines.length; i++) {
        const line = stage2.lines[i];
        const originalLineNumber = mapStage2ToOriginal(i, stage2.sourceMap, stage1.sourceMap);
        const trimmedLine = line.trim();

        // Track control blocks
        if (trimmedLine.startsWith('#if ')) {
            controlBlockStack.push('if');
        } else if (trimmedLine === '#end if') {
            if (controlBlockStack[controlBlockStack.length - 1] === 'if') {
                controlBlockStack.pop();
            }
        } else if (trimmedLine === '#repeat' || trimmedLine.startsWith('#repeat ')) {
            controlBlockStack.push('repeat');
        } else if (trimmedLine.startsWith('#for ')) {
            controlBlockStack.push('for');
        } else if (trimmedLine.startsWith('#while ')) {
            controlBlockStack.push('while');
        } else if (trimmedLine === '#loop') {
            // #loop closes #repeat, #for, or #while
            const top = controlBlockStack[controlBlockStack.length - 1];
            if (top === 'repeat' || top === 'for' || top === 'while') {
                controlBlockStack.pop();
            }
        }

        // Skip non-macro lines
        if (!trimmedLine.startsWith('#def ') && trimmedLine !== '#end def') {
            continue;
        }

        // Check macro definition syntax
        if (trimmedLine.startsWith('#def ')) {
            // Check for nested macro definitions
            if (inMacroDefinition) {
                const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, line.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Nested macro definition not allowed (macro started at line ${macroDefStartLine + 1})`,
                    'CPD-2207',
                    vscode.DiagnosticSeverity.Error
                ));
            }

            // Check if inside control block
            if (controlBlockStack.length > 0) {
                const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, line.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Macro definition inside ${controlBlockStack[controlBlockStack.length - 1]} block has no effect`,
                    'CPD-2209',
                    vscode.DiagnosticSeverity.Warning
                ));
            }

            checkMacroDefinitionSyntax(line, originalLineNumber, diagnostics);

            // Check if it's a multiline macro
            const isInline = /#def\s+[a-zA-Z_][^\s]*(?:\([^)]*\))?\s*=/.test(trimmedLine);
            if (!isInline) {
                inMacroDefinition = true;
                macroDefStartLine = originalLineNumber;
            }
        } else if (trimmedLine === '#end def') {
            if (!inMacroDefinition) {
                const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, line.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    '#end def without matching #def',
                    'CPD-2206',
                    vscode.DiagnosticSeverity.Error
                ));
            }
            inMacroDefinition = false;
        }
    }

    // Check for unclosed macro definition
    if (inMacroDefinition) {
        const range = new vscode.Range(macroDefStartLine, 0, macroDefStartLine, 999);
        diagnostics.push(createDiagnosticWithCode(
            range,
            '#def without matching #end def',
            'CPD-2206',
            vscode.DiagnosticSeverity.Error
        ));
    }
}

/**
 * Check macro definition syntax
 * Error codes:
 * - CPD-2202: Macro name missing $ suffix (ERROR - required)
 * - CPD-2203: Macro parameter missing $ suffix (ERROR - required)
 * - CPD-2204: Invalid macro name
 * - CPD-2205: Malformed #def syntax
 * - CPD-2208: Invalid macro parameter syntax
 */
function checkMacroDefinitionSyntax(
    line: string,
    lineNumber: number,
    diagnostics: vscode.Diagnostic[]
): void {
    const trimmedLine = line.trim();

    // Parse macro definition
    const inlineMacroPattern = /#def\s+([a-zA-Z_$][a-zA-Z0-9_$]*\$?)(?:\(([^)]*)\))?\s*=\s*(.+)/;
    const multilineMacroPattern = /#def\s+([a-zA-Z_$][a-zA-Z0-9_$]*\$?)(?:\(([^)]*)\))?\s*$/;

    let match = inlineMacroPattern.exec(trimmedLine);

    if (!match) {
        match = multilineMacroPattern.exec(trimmedLine);
    }

    if (!match) {
        const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Malformed #def syntax',
            'CPD-2205',
            vscode.DiagnosticSeverity.Error
        ));
        return;
    }

    const macroName = match[1];
    const paramsStr = match[2] || '';

    // Check macro name ends with $
    if (!macroName.endsWith('$')) {
        const macroStartPos = line.indexOf(macroName);
        const range = new vscode.Range(lineNumber, macroStartPos, lineNumber, macroStartPos + macroName.length);
        diagnostics.push(createDiagnosticWithCode(
            range,
            `Macro name '${macroName}' must end with '$'`,
            'CPD-2202',
            vscode.DiagnosticSeverity.Error
        ));
    }

    // Check macro name starts with letter
    if (!/^[a-zA-Z_]/.test(macroName)) {
        const macroStartPos = line.indexOf(macroName);
        const range = new vscode.Range(lineNumber, macroStartPos, lineNumber, macroStartPos + macroName.length);
        diagnostics.push(createDiagnosticWithCode(
            range,
            'Macro name must start with a letter',
            'CPD-2204',
            vscode.DiagnosticSeverity.Error
        ));
    }

    // Check parameters
    if (paramsStr.trim()) {
        const params = splitParameters(paramsStr);

        for (const param of params) {
            if (!param) {
                continue; // Empty parameter from split
            }

            if (!param.endsWith('$')) {
                const paramStartPos = line.indexOf(param);
                const range = new vscode.Range(lineNumber, paramStartPos, lineNumber, paramStartPos + param.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    `Macro parameter '${param}' must end with '$'`,
                    'CPD-2203',
                    vscode.DiagnosticSeverity.Error
                ));
            }

            if (!/^[a-zA-Z_]/.test(param)) {
                const paramStartPos = line.indexOf(param);
                const range = new vscode.Range(lineNumber, paramStartPos, lineNumber, paramStartPos + param.length);
                diagnostics.push(createDiagnosticWithCode(
                    range,
                    'Macro parameter must start with a letter',
                    'CPD-2208',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }
}
