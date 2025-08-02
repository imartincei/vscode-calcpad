import * as vscode from 'vscode';

export class CalcpadLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;

    // Built-in functions from the Calcpad language
    private readonly builtInFunctions = new Set([
        'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
        'sinh', 'cosh', 'tanh', 'csch', 'sech', 'coth',
        'asin', 'acos', 'atan', 'acsc', 'asec', 'acot',
        'asinh', 'acosh', 'atanh', 'acsch', 'asech', 'acoth',
        'log', 'ln', 'log_2', 'exp', 'sqr', 'sqrt', 'cbrt', 'root',
        'round', 'floor', 'ceiling', 'trunc',
        'mod', 'gcd', 'lcm', 'abs', 're', 'im', 'phase',
        'min', 'max', 'sum', 'sumsq', 'srss', 'average', 'product', 'mean',
        'if', 'switch', 'not', 'and', 'or', 'xor',
        'vector', 'len', 'size', 'resize', 'fill', 'range', 'join',
        'matrix', 'identity', 'diagonal', 'column', 'det', 'inverse',
        'take', 'line', 'spline', 'random', 'sign', 'atan2'
    ]);

    // Control keywords
    private readonly controlKeywords = new Set([
        'if', 'else', 'end', 'for', 'while', 'repeat', 'loop',
        'break', 'continue', 'include', 'def', 'local', 'global',
        'hide', 'show', 'pre', 'post', 'val', 'equ', 'noc',
        'nosub', 'novar', 'varsub', 'split', 'wrap', 'round',
        'format', 'deg', 'rad', 'gra', 'pause', 'input'
    ]);

    // Mathematical operators
    private readonly operators = /[+\-*/^÷\\⦼=≡≠<>≤≥∧∨⊕]/;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('calcpad');
    }

    public lintDocument(document: vscode.TextDocument): void {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Check for unmatched control blocks first
        this.checkControlBlockBalance(lines, diagnostics);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i;

            // Skip empty lines and comments
            if (line.trim() === '' || line.trim().startsWith('"') || line.trim().startsWith("'")) {
                continue;
            }

            // Check for various syntax issues
            this.checkParenthesesBalance(line, lineNumber, diagnostics);
            this.checkBracketBalance(line, lineNumber, diagnostics);
            this.checkVariableNaming(line, lineNumber, diagnostics);
            this.checkFunctionUsage(line, lineNumber, diagnostics);
            this.checkOperatorSyntax(line, lineNumber, diagnostics);
            this.checkControlStructures(line, lineNumber, diagnostics);
            this.checkAssignments(line, lineNumber, diagnostics);
            this.checkUnits(line, lineNumber, diagnostics);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private checkControlBlockBalance(lines: string[], diagnostics: vscode.Diagnostic[]): void {
        const blockStack: { type: string; lineNumber: number; position: number }[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Skip empty lines and comments
            if (trimmedLine === '' || trimmedLine.startsWith('"') || trimmedLine.startsWith("'")) {
                continue;
            }

            // Check for block opening keywords
            if (trimmedLine.match(/^#(if|for|while|repeat|def)\b/)) {
                const keyword = trimmedLine.match(/^#(\w+)/)?.[1];
                if (keyword) {
                    blockStack.push({
                        type: keyword,
                        lineNumber: i,
                        position: line.indexOf('#' + keyword)
                    });
                }
            }
            // Check for block closing keywords
            else if (trimmedLine.match(/^#(end|end\s+if|loop|end\s+while|end\s+repeat|end\s+def)\b/)) {
                if (blockStack.length === 0) {
                    // Unmatched closing block
                    const range = new vscode.Range(i, line.indexOf('#'), i, line.indexOf('#') + trimmedLine.split(' ')[0].length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        'Unmatched closing block. No corresponding opening block found',
                        vscode.DiagnosticSeverity.Error
                    ));
                } else {
                    blockStack.pop();
                }
            }
        }

        // Check for unmatched opening blocks
        for (const block of blockStack) {
            const range = new vscode.Range(block.lineNumber, block.position, block.lineNumber, block.position + block.type.length + 1);
            let message = '';
            switch (block.type) {
                case 'if':
                    message = '"#if" block not closed. Missing "#end if"';
                    break;
                case 'for':
                    message = '"#for" block not closed. Missing "#loop"';
                    break;
                case 'while':
                    message = '"#while" block not closed. Missing "#end while"';
                    break;
                case 'repeat':
                    message = '"#repeat" block not closed. Missing "#end repeat"';
                    break;
                case 'def':
                    message = '"#def" block not closed. Missing "#end def"';
                    break;
                default:
                    message = `"#${block.type}" block not closed. Missing "#end"`;
            }
            
            diagnostics.push(new vscode.Diagnostic(
                range,
                message,
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    private checkParenthesesBalance(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        let balance = 0;
        let lastOpenPos = -1;

        for (let i = 0; i < line.length; i++) {
            if (line[i] === '(') {
                balance++;
                lastOpenPos = i;
            } else if (line[i] === ')') {
                balance--;
                if (balance < 0) {
                    const range = new vscode.Range(lineNumber, i, lineNumber, i + 1);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        'Unmatched closing parenthesis',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }
            }
        }

        if (balance > 0) {
            const range = new vscode.Range(lineNumber, lastOpenPos, lineNumber, lastOpenPos + 1);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Unmatched opening parenthesis',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    private checkBracketBalance(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        let squareBalance = 0;
        let curlyBalance = 0;

        for (let i = 0; i < line.length; i++) {
            switch (line[i]) {
                case '[':
                    squareBalance++;
                    break;
                case ']':
                    squareBalance--;
                    if (squareBalance < 0) {
                        const range = new vscode.Range(lineNumber, i, lineNumber, i + 1);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            'Unmatched closing square bracket',
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                    break;
                case '{':
                    curlyBalance++;
                    break;
                case '}':
                    curlyBalance--;
                    if (curlyBalance < 0) {
                        const range = new vscode.Range(lineNumber, i, lineNumber, i + 1);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            'Unmatched closing curly brace',
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                    break;
            }
        }
    }

    private checkVariableNaming(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Variables must start with a letter and can contain letters, numbers, underscores, and special symbols
        const variablePattern = /\b([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*)\s*=/g;
        let match;

        while ((match = variablePattern.exec(line)) !== null) {
            const varName = match[1];

            // Check if variable name starts with a number (invalid)
            if (/^[0-9]/.test(varName)) {
                const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + varName.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    'Variable names must start with a letter',
                    vscode.DiagnosticSeverity.Error
                ));
            }

            // Check if variable name conflicts with built-in functions
            if (this.builtInFunctions.has(varName.toLowerCase())) {
                const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + varName.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Variable name '${varName}' conflicts with built-in function`,
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    }

    private checkFunctionUsage(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Check for function calls with missing parentheses or incorrect syntax
        const functionCallPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        let match;

        while ((match = functionCallPattern.exec(line)) !== null) {
            const funcName = match[1];

            // Check if it's an unknown function (not built-in)
            if (!this.builtInFunctions.has(funcName.toLowerCase()) && !this.controlKeywords.has(funcName.toLowerCase())) {
                const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + funcName.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Unknown function '${funcName}'`,
                    vscode.DiagnosticSeverity.Information
                ));
            }
        }

        // Check for missing semicolons in function parameters
        const semicolonFunctions = ['min', 'max', 'sum', 'average', 'gcd', 'lcm'];
        for (const func of semicolonFunctions) {
            const pattern = new RegExp(`\\b${func}\\s*\\(([^)]+)\\)`, 'gi');
            const funcMatch = pattern.exec(line);
            if (funcMatch) {
                const params = funcMatch[1];
                if (params.includes(',') && !params.includes(';')) {
                    const range = new vscode.Range(lineNumber, funcMatch.index, lineNumber, funcMatch.index + funcMatch[0].length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Function '${func}' parameters should be separated by semicolons, not commas`,
                        vscode.DiagnosticSeverity.Warning
                    ));
                }
            }
        }
    }

    private checkOperatorSyntax(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Check for consecutive operators
        const consecutiveOpsPattern = /[+\-*/^÷\\⦼]{2,}/g;
        let match;

        while ((match = consecutiveOpsPattern.exec(line)) !== null) {
            const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Consecutive operators are not allowed',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for operators at line end (incomplete expressions)
        const lineEndOpsPattern = /[+\-*/^÷\\⦼=]\s*$/;
        if (lineEndOpsPattern.test(line)) {
            const match = line.match(lineEndOpsPattern);
            if (match) {
                const index = line.lastIndexOf(match[0].trim());
                const range = new vscode.Range(lineNumber, index, lineNumber, index + 1);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    'Incomplete expression: operator at end of line',
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
    }

    private checkControlStructures(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        const trimmedLine = line.trim();

        // Check for control keywords that should start with #
        if (trimmedLine.match(/^(if|else|end|for|while|repeat|loop|def|include)\b/) && !trimmedLine.startsWith('#')) {
            const range = new vscode.Range(lineNumber, 0, lineNumber, line.indexOf(trimmedLine) + trimmedLine.split(' ')[0].length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Control keywords should be prefixed with #',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for incomplete if statements
        if (trimmedLine.startsWith('#if') && !trimmedLine.includes('=') && !this.operators.test(trimmedLine)) {
            const range = new vscode.Range(lineNumber, 0, lineNumber, line.length);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Incomplete if condition',
                vscode.DiagnosticSeverity.Warning
            ));
        }
    }

    private checkAssignments(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Check for multiple assignment operators
        const assignmentCount = (line.match(/=/g) || []).length;
        if (assignmentCount > 1) {
            // Find all assignment positions
            let pos = 0;
            let count = 0;
            while ((pos = line.indexOf('=', pos)) !== -1) {
                count++;
                if (count > 1) {
                    const range = new vscode.Range(lineNumber, pos, lineNumber, pos + 1);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        'Multiple assignments in one line are not recommended',
                        vscode.DiagnosticSeverity.Information
                    ));
                }
                pos++;
            }
        }

        // Check for assignment without variable name
        if (line.trim().startsWith('=')) {
            const range = new vscode.Range(lineNumber, line.indexOf('='), lineNumber, line.indexOf('=') + 1);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Assignment without variable name',
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    private checkUnits(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Check for common unit conversion issues
        const unitPattern = /\b\d+(\.\d+)?\s*([a-zA-Z°]+)\b/g;
        let match;

        const validUnits = new Set([
            'm', 'cm', 'mm', 'km', 'ft', 'in', 'yd',
            'kg', 'g', 'lb', 't',
            's', 'min', 'h', 'd',
            'N', 'kN', 'MN', 'lbf',
            'Pa', 'kPa', 'MPa', 'psi',
            '°', 'deg', 'rad',
            'J', 'kJ', 'MJ', 'cal', 'kcal'
        ]);

        while ((match = unitPattern.exec(line)) !== null) {
            const unit = match[2];
            if (!validUnits.has(unit)) {
                const numberPart = match[1] || '';
                const numberPartLength = match[0].indexOf(unit);
                const range = new vscode.Range(lineNumber, match.index + numberPartLength, lineNumber, match.index + match[0].length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Unknown unit '${unit}'. Check spelling or use custom unit definition`,
                    vscode.DiagnosticSeverity.Information
                ));
            }
        }

        // Check for degree symbol usage
        if (line.includes('°') && !line.match(/\d+°/)) {
            const pos = line.indexOf('°');
            const range = new vscode.Range(lineNumber, pos, lineNumber, pos + 1);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'Degree symbol should follow a number',
                vscode.DiagnosticSeverity.Warning
            ));
        }
    }

    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}