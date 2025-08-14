import * as vscode from 'vscode';

export class CalcpadLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;

    // Built-in functions from the Calcpad language (from HighLighter.cs)
    private readonly builtInFunctions = new Set([
        // Basic math
        'abs', 'mod', 'gcd', 'lcm', 'sign', 'random',
        // Trigonometric
        'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
        'asin', 'acos', 'atan', 'atan2', 'acsc', 'asec', 'acot',
        // Hyperbolic
        'sinh', 'cosh', 'tanh', 'csch', 'sech', 'coth',
        'asinh', 'acosh', 'atanh', 'acsch', 'asech', 'acoth',
        // Logarithmic and exponential
        'log', 'ln', 'log_2', 'exp', 'sqr', 'sqrt', 'cbrt', 'root',
        // Rounding
        'round', 'floor', 'ceiling', 'trunc',
        // Complex numbers
        're', 'im', 'phase',
        // Aggregate functions
        'min', 'max', 'sum', 'sumsq', 'srss', 'product', 'average', 'mean',
        // Conditional and logical
        'if', 'switch', 'not', 'and', 'or', 'xor',
        // Interpolation
        'take', 'line', 'spline',
        // Units and high-performance
        'timer', 'hp', 'ishp', 'getunits', 'setunits', 'clrunits',
        // Vector functions
        'vector', 'vector_hp', 'len', 'size', 'fill', 'range', 'range_hp', 'join', 'resize',
        'first', 'last', 'slice', 'sort', 'rsort', 'order', 'revorder', 'reverse', 'extract',
        'search', 'count', 'find', 'find_eq', 'find_ne', 'find_lt', 'find_gt', 'find_le', 'find_ge',
        'lookup', 'lookup_eq', 'lookup_ne', 'lookup_lt', 'lookup_gt', 'lookup_le', 'lookup_ge',
        'norm', 'norm_1', 'norm_2', 'norm_e', 'norm_i', 'norm_p', 'unit', 'dot', 'cross',
        // Matrix functions
        'matrix', 'identity', 'diagonal', 'column', 'utriang', 'ltriang', 'symmetric',
        'vec2diag', 'diag2vec', 'vec2col', 'vec2row',
        'matrix_hp', 'identity_hp', 'diagonal_hp', 'column_hp', 'utriang_hp', 'ltriang_hp', 'symmetric_hp',
        'join_cols', 'join_rows', 'augment', 'stack', 'mfill', 'fill_row', 'fill_col', 'mresize',
        'copy', 'add', 'n_rows', 'n_cols', 'row', 'col', 'extract_rows', 'extract_cols', 'submatrix',
        'mnorm', 'mnorm_2', 'mnorm_e', 'mnorm_1', 'mnorm_i',
        'cond', 'cond_1', 'cond_2', 'cond_e', 'cond_i',
        'det', 'rank', 'transp', 'trace', 'inverse', 'adj', 'cofactor',
        'eigenvals', 'eigenvecs', 'eigen', 'lu', 'qr', 'svd', 'cholesky',
        'lsolve', 'clsolve', 'slsolve', 'msolve', 'cmsolve', 'smsolve',
        'hprod', 'fprod', 'kprod',
        'sort_cols', 'rsort_cols', 'sort_rows', 'rsort_rows',
        'order_cols', 'revorder_cols', 'order_rows', 'revorder_rows',
        'mcount', 'mfind', 'mfind_eq', 'mfind_ne', 'mfind_lt', 'mfind_le', 'mfind_gt', 'mfind_ge', 'msearch',
        'hlookup', 'hlookup_eq', 'hlookup_ne', 'hlookup_lt', 'hlookup_le', 'hlookup_gt', 'hlookup_ge',
        'vlookup', 'vlookup_eq', 'vlookup_ne', 'vlookup_lt', 'vlookup_le', 'vlookup_gt', 'vlookup_ge'
    ]);

    // Control keywords from HighLighter.cs Keywords set
    private readonly controlKeywords = new Set([
        // Conditional and flow control
        'if', 'else', 'else if', 'end if', 'for', 'while', 'repeat', 'loop', 'break', 'continue',
        // Angle units
        'rad', 'deg', 'gra',
        // Display control
        'val', 'equ', 'noc', 'round', 'format', 'show', 'hide',
        'varsub', 'nosub', 'novar', 'split', 'wrap', 'pre', 'post',
        // Modules and macros
        'include', 'local', 'global', 'def', 'end def',
        // Interactive
        'pause', 'input',
        // Markdown
        'md',
        // Data exchange
        'read', 'write', 'append'
    ]);

    // All valid keywords that can follow # (from HighLighter.cs Keywords set)
    private readonly validHashKeywords = new Set([
        'if', 'else', 'else if', 'end if', 'rad', 'deg', 'gra', 'val', 'equ', 'noc', 
        'round', 'format', 'show', 'hide', 'varsub', 'nosub', 'novar', 'split', 'wrap', 
        'pre', 'post', 'repeat', 'for', 'while', 'loop', 'break', 'continue', 'include', 
        'local', 'global', 'def', 'end def', 'pause', 'input', 'md', 'read', 'write', 'append', 'fetch'
    ]);

    // Mathematical operators from CalcPad documentation  
    private readonly operators = /[!^\/÷\\⦼*\-+<>≤≥≡≠=∧∨⊕]/;
    
    // Commands from HighLighter.cs
    private readonly commands = new Set([
        '$find', '$root', '$sup', '$inf', '$area', '$integral', '$slope',
        '$repeat', '$sum', '$product', '$plot', '$map'
    ]);

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
            this.checkCommandUsage(line, lineNumber, diagnostics);
            this.checkOperatorSyntax(line, lineNumber, diagnostics);
            this.checkControlStructures(line, lineNumber, diagnostics);
            this.checkKeywordValidation(line, lineNumber, diagnostics);
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
                    vscode.DiagnosticSeverity.Error
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
                    vscode.DiagnosticSeverity.Error
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
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
    }

    private checkCommandUsage(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Check for command usage (e.g., $Plot, $Root, etc.)
        const commandPattern = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match;

        while ((match = commandPattern.exec(line)) !== null) {
            const cmdName = '$' + match[1].toLowerCase();
            
            if (!this.commands.has(cmdName)) {
                const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Unknown command '${match[0]}'. Valid commands are: ${Array.from(this.commands).join(', ')}`,
                    vscode.DiagnosticSeverity.Error
                ));
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
                    vscode.DiagnosticSeverity.Error
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
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    private checkKeywordValidation(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Check for invalid keywords starting with #
        const hashKeywordPattern = /#([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/g;
        let match;

        while ((match = hashKeywordPattern.exec(line)) !== null) {
            const fullKeywordMatch = match[1].toLowerCase();
            
            // Check if it's a compound keyword first (e.g., "else if", "end if", "end def")
            let keyword = fullKeywordMatch;
            let keywordEndPos = match.index + match[0].length;
            
            if (this.validHashKeywords.has(keyword)) {
                continue; // Valid compound keyword
            }
            
            // If compound keyword is not valid, check just the first word
            const firstWord = fullKeywordMatch.split(' ')[0];
            if (this.validHashKeywords.has(firstWord)) {
                continue; // Valid single keyword (e.g., "for" in "#for i")
            }
            
            // Neither compound nor single keyword is valid
            const range = new vscode.Range(
                lineNumber, 
                match.index, 
                lineNumber, 
                match.index + 1 + firstWord.length // Only highlight the keyword part, not arguments
            );
            
            // Provide suggestions for similar keywords
            const suggestions = this.getSimilarKeywords(firstWord);
            const suggestionText = suggestions.length > 0 
                ? ` Did you mean: ${suggestions.join(', ')}?`
                : '';
            
            diagnostics.push(new vscode.Diagnostic(
                range,
                `Invalid keyword '#${firstWord}'.${suggestionText}`,
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    private getSimilarKeywords(keyword: string): string[] {
        const suggestions: string[] = [];
        const threshold = 2; // Maximum edit distance
        
        for (const validKeyword of this.validHashKeywords) {
            if (this.levenshteinDistance(keyword, validKeyword) <= threshold) {
                suggestions.push('#' + validKeyword);
            }
        }
        
        return suggestions.slice(0, 3); // Return max 3 suggestions
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i += 1) {
            matrix[0][i] = i;
        }

        for (let j = 0; j <= str2.length; j += 1) {
            matrix[j][0] = j;
        }

        for (let j = 1; j <= str2.length; j += 1) {
            for (let i = 1; i <= str1.length; i += 1) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + indicator, // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
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
                        'Multiple assignments in one line are not allowed',
                        vscode.DiagnosticSeverity.Error
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
            // Dimensionless
            '%', '‰', '‱', 'pcm', 'ppm', 'ppb', 'ppt', 'ppq',
            // Angle units
            '°', '′', '″', 'deg', 'rad', 'grad', 'rev',
            // Metric units (SI and compatible)
            // Mass
            'g', 'hg', 'kg', 't', 'kt', 'Mt', 'Gt', 'dg', 'cg', 'mg', 'μg', 'Da', 'u',
            // Length
            'm', 'km', 'dm', 'cm', 'mm', 'μm', 'nm', 'pm', 'AU', 'ly',
            // Time
            's', 'ms', 'μs', 'ns', 'ps', 'min', 'h', 'd', 'w', 'y',
            // Frequency
            'Hz', 'kHz', 'MHz', 'GHz', 'THz', 'mHz', 'μHz', 'nHz', 'pHz', 'rpm',
            // Speed
            'kmh',
            // Electric current
            'A', 'kA', 'MA', 'GA', 'TA', 'mA', 'μA', 'nA', 'pA',
            // Temperature
            '°C', 'Δ°C', 'K',
            // Amount of substance
            'mol',
            // Luminous intensity
            'cd',
            // Area
            'a', 'daa', 'ha',
            // Volume
            'L', 'daL', 'hL', 'dL', 'cL', 'mL', 'μL', 'nL', 'pL',
            // Force
            'dyn', 'N', 'daN', 'hN', 'kN', 'MN', 'GN', 'TN', 'gf', 'kgf', 'tf',
            // Moment
            'Nm', 'kNm',
            // Pressure
            'Pa', 'daPa', 'hPa', 'kPa', 'MPa', 'GPa', 'TPa', 'dPa', 'cPa', 'mPa', 'μPa', 'nPa', 'pPa',
            'bar', 'mbar', 'μbar', 'atm', 'at', 'Torr', 'mmHg',
            // Viscosity
            'P', 'cP', 'St', 'cSt',
            // Energy work
            'J', 'kJ', 'MJ', 'GJ', 'TJ', 'mJ', 'μJ', 'nJ', 'pJ',
            'Wh', 'kWh', 'MWh', 'GWh', 'TWh', 'mWh', 'μWh', 'nWh', 'pWh',
            'eV', 'keV', 'MeV', 'GeV', 'TeV', 'PeV', 'EeV', 'cal', 'kcal', 'erg',
            // Power
            'W', 'kW', 'MW', 'GW', 'TW', 'mW', 'μW', 'nW', 'pW', 'hpM', 'ks',
            'VA', 'kVA', 'MVA', 'GVA', 'TVA', 'mVA', 'μVA', 'nVA', 'pVA',
            'VAR', 'kVAR', 'MVAR', 'GVAR', 'TVAR', 'mVAR', 'μVAR', 'nVAR', 'pVAR',
            // Electric charge
            'C', 'kC', 'MC', 'GC', 'TC', 'mC', 'μC', 'nC', 'pC', 'Ah', 'mAh',
            // Potential
            'V', 'kV', 'MV', 'GV', 'TV', 'mV', 'μV', 'nV', 'pV',
            // Capacitance
            'F', 'kF', 'MF', 'GF', 'TF', 'mF', 'μF', 'nF', 'pF',
            // Resistance
            'Ω', 'kΩ', 'MΩ', 'GΩ', 'TΩ', 'mΩ', 'μΩ', 'nΩ', 'pΩ',
            // Conductance
            'S', 'kS', 'MS', 'GS', 'TS', 'mS', 'μS', 'nS', 'pS', '℧', 'k℧', 'M℧', 'G℧', 'T℧', 'm℧', 'μ℧', 'n℧', 'p℧',
            // Magnetic flux
            'Wb', 'kWb', 'MWb', 'GWb', 'TWb', 'mWb', 'μWb', 'nWb', 'pWb',
            // Magnetic flux density
            'T', 'kT', 'MT', 'GT', 'TT', 'mT', 'μT', 'nT', 'pT',
            // Inductance
            'H', 'kH', 'MH', 'GH', 'TH', 'mH', 'μH', 'nH', 'pH',
            // Luminous flux
            'lm',
            // Illuminance
            'lx',
            // Radioactivity
            'Bq', 'kBq', 'MBq', 'GBq', 'TBq', 'mBq', 'μBq', 'nBq', 'pBq', 'Ci', 'Rd',
            // Absorbed dose
            'Gy', 'kGy', 'MGy', 'GGy', 'TGy', 'mGy', 'μGy', 'nGy', 'pGy',
            // Equivalent dose
            'Sv', 'kSv', 'MSv', 'GSv', 'TSv', 'mSv', 'μSv', 'nSv', 'pSv',
            // Catalytic activity
            'kat',
            // Imperial/US units
            // Mass
            'gr', 'dr', 'oz', 'lb', 'lbm', 'lb_m', 'klb', 'kipm', 'kip_m', 'st', 'qr',
            'cwt', 'cwt_UK', 'cwt_US', 'ton', 'ton_UK', 'ton_US', 'slug',
            // Length
            'th', 'in', 'ft', 'yd', 'ch', 'fur', 'mi', 'ftm', 'ftm_UK', 'ftm_US',
            'cable', 'cable_UK', 'cable_US', 'nmi', 'li', 'rod', 'pole', 'perch', 'lea',
            // Speed
            'mph', 'knot',
            // Temperature
            '°F', 'Δ°F', '°R',
            // Area
            'rood', 'ac',
            // Volume
            'fl_oz', 'gi', 'pt', 'qt', 'gal', 'bbl',
            'fl_oz_UK', 'gi_UK', 'pt_UK', 'qt_UK', 'gal_UK', 'bbl_UK',
            'fl_oz_US', 'gi_US', 'pt_US', 'qt_US', 'gal_US', 'bbl_US',
            'pt_dry', 'qt_dry', 'gal_dry', 'bbl_dry', 'pk', 'pk_UK', 'pk_US', 'bu', 'bu_UK', 'bu_US',
            // Force
            'ozf', 'oz_f', 'lbf', 'lb_f', 'kip', 'kipf', 'kip_f', 'tonf', 'ton_f', 'pdl',
            // Pressure
            'osi', 'osf', 'psi', 'psf', 'ksi', 'ksf', 'tsi', 'tsf', 'inHg',
            // Energy
            'BTU', 'therm', 'therm_UK', 'therm_US', 'quad',
            // Power
            'hp', 'hpE', 'hpS'
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
                    vscode.DiagnosticSeverity.Error
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
                vscode.DiagnosticSeverity.Error
            ));
        }
    }

    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}