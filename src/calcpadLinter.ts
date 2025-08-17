import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Interface for centralized definition collection
interface DefinitionCollector {
    getAllVariables(): Set<string>;
    getAllFunctions(): Map<string, number>;
    getAllMacros(): Map<string, number>;
    getBuiltInFunctions(): Set<string>;
    getControlKeywords(): Set<string>;
    getCommands(): Set<string>;
    getValidHashKeywords(): Set<string>;
}

export class CalcpadLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;

    // Common regex patterns used throughout the linter
    private static readonly IDENTIFIER_CHARS = 'a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻';
    private static readonly IDENTIFIER_START_CHARS = 'a-zA-Zα-ωΑ-Ω°øØ∡';
    
    // Regex patterns for common identifier types
    private static readonly PATTERNS = {
        // Basic identifier (variable/function name)
        identifier: new RegExp(`\\b([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$?)\\b`, 'g'),
        
        // Variable assignment pattern
        variableAssignment: new RegExp(`^([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$?)\\s*=`),
        
        // Function definition pattern  
        functionDefinition: new RegExp(`^([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*)\\s*\\(([^)]*)\\)\\s*=`),
        
        // Macro name pattern (with optional $)
        macroName: new RegExp(`([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$?)`),
        
        // Macro call pattern
        macroCall: new RegExp(`\\b([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$)(?:\\(([^)]*)\\))?`, 'g'),
        
        // Inline macro definition
        inlineMacroDef: new RegExp(`#def\\s+([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$?)(?:\\(([^)]*)\\))?\\s*=\\s*(.+)`),
        
        // Multiline macro definition
        multilineMacroDef: new RegExp(`#def\\s+([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$?)(?:\\(([^)]*)\\))?\\s*$`)
    };

    // Common constants
    private static readonly COMMON_CONSTANTS = new Set(['e', 'pi', 'π', 'i', 'j']);
    private static readonly SUGGESTION_THRESHOLD = 2; // Max edit distance for suggestions

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

    // Helper methods for common operations
    private static isEmptyOrComment(line: string): boolean {
        const trimmed = line.trim();
        return trimmed === '' || trimmed.startsWith('"') || trimmed.startsWith("'");
    }

    private static isEmptyCommentOrDirective(line: string): boolean {
        const trimmed = line.trim();
        return trimmed === '' || trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('#');
    }

    private static shouldSkipLine(line: string): boolean {
        return CalcpadLinter.isEmptyOrComment(line);
    }

    private static splitParameters(params: string): string[] {
        return params.trim() === '' ? [] : params.split(';').map((p: string) => p.trim()).filter(p => p);
    }

    private static countParameters(params: string): number {
        return CalcpadLinter.splitParameters(params).length;
    }

    private isBuiltInOrConstant(identifier: string): boolean {
        return this.builtInFunctions.has(identifier.toLowerCase()) || 
               this.controlKeywords.has(identifier.toLowerCase()) ||
               CalcpadLinter.COMMON_CONSTANTS.has(identifier.toLowerCase());
    }

    private getSimilarIdentifiers(identifier: string, candidates: Iterable<string>, suffix: string = ''): string[] {
        const suggestions: string[] = [];
        
        for (const candidate of candidates) {
            if (this.levenshteinDistance(identifier.toLowerCase(), candidate.toLowerCase()) <= CalcpadLinter.SUGGESTION_THRESHOLD) {
                suggestions.push(candidate + suffix);
            }
        }
        
        return suggestions.slice(0, 3); // Return max 3 suggestions
    }


    // Create a definition collector from processed content
    public createDefinitionCollector(lines: string[]): DefinitionCollector {
        const variables = this.collectDefinedVariables(lines);
        const functions = this.collectUserDefinedFunctions(lines);
        const macros = this.collectUserDefinedMacros(lines);

        return {
            getAllVariables: () => variables,
            getAllFunctions: () => functions,
            getAllMacros: () => macros,
            getBuiltInFunctions: () => this.builtInFunctions,
            getControlKeywords: () => this.controlKeywords,
            getCommands: () => this.commands,
            getValidHashKeywords: () => this.validHashKeywords
        };
    }

    // Helper to check if identifier is any known type
    public isKnownIdentifier(identifier: string, collector: DefinitionCollector): {
        isKnown: boolean;
        type: 'variable' | 'function' | 'macro' | 'builtin' | 'keyword' | 'command' | 'constant';
    } {
        // Check built-in constants first
        if (CalcpadLinter.COMMON_CONSTANTS.has(identifier.toLowerCase())) {
            return { isKnown: true, type: 'constant' };
        }

        // Check built-in functions
        if (collector.getBuiltInFunctions().has(identifier.toLowerCase())) {
            return { isKnown: true, type: 'builtin' };
        }

        // Check control keywords
        if (collector.getControlKeywords().has(identifier.toLowerCase())) {
            return { isKnown: true, type: 'keyword' };
        }

        // Check commands
        if (collector.getCommands().has('$' + identifier.toLowerCase())) {
            return { isKnown: true, type: 'command' };
        }

        // Check user-defined variables
        if (collector.getAllVariables().has(identifier)) {
            return { isKnown: true, type: 'variable' };
        }

        // Check user-defined functions
        if (collector.getAllFunctions().has(identifier)) {
            return { isKnown: true, type: 'function' };
        }

        // Check user-defined macros
        if (collector.getAllMacros().has(identifier)) {
            return { isKnown: true, type: 'macro' };
        }

        return { isKnown: false, type: 'variable' }; // Default assumption
    }

    // Get suggestions from all known identifiers
    public getSuggestionsFromCollector(identifier: string, collector: DefinitionCollector): string[] {
        const allSuggestions: string[] = [];
        
        // Check against all types
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, collector.getAllVariables()));
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, collector.getAllFunctions().keys(), '()'));
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, collector.getAllMacros().keys()));
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, collector.getBuiltInFunctions(), '()'));
        
        return allSuggestions.slice(0, 3); // Return max 3 suggestions
    }

    // Helper to get all identifiers from a collector
    public getAllIdentifiersFromCollector(collector: DefinitionCollector): {
        variables: Set<string>,
        functions: Set<string>,
        macros: Set<string>,
        builtins: Set<string>,
        keywords: Set<string>
    } {
        return {
            variables: collector.getAllVariables(),
            functions: new Set(collector.getAllFunctions().keys()),
            macros: new Set(collector.getAllMacros().keys()),
            builtins: collector.getBuiltInFunctions(),
            keywords: collector.getControlKeywords()
        };
    }

    // Create a simple collector for just built-in definitions (for validation contexts that don't need user definitions)
    public createBuiltInCollector(): DefinitionCollector {
        return {
            getAllVariables: () => new Set<string>(),
            getAllFunctions: () => new Map<string, number>(),
            getAllMacros: () => new Map<string, number>(),
            getBuiltInFunctions: () => this.builtInFunctions,
            getControlKeywords: () => this.controlKeywords,
            getCommands: () => this.commands,
            getValidHashKeywords: () => this.validHashKeywords
        };
    }

    public getCompiledContent(document: vscode.TextDocument): {
        expandedLines: string[],
        sourceMap: Map<number, number>,
        userDefinedFunctions: Map<string, number>,
        userDefinedMacros: Map<string, number>,
        definedVariables: Set<string>,
        definitions: DefinitionCollector
    } {
        const text = document.getText();
        const lines = text.split('\n');

        // Content resolution: expand includes, macros, and fetch operations
        const resolvedContent = this.resolveContent(lines, document.uri);
        const expandedLines = resolvedContent.expandedLines;
        const sourceMap = resolvedContent.sourceMap;

        // Collect definitions from resolved content
        const userDefinedFunctions = this.collectUserDefinedFunctions(expandedLines);
        const userDefinedMacros = this.collectUserDefinedMacros(expandedLines);
        const definedVariables = this.collectDefinedVariables(expandedLines);
        
        // Create centralized definition collector
        const definitions = this.createDefinitionCollector(expandedLines);

        return {
            expandedLines,
            sourceMap,
            userDefinedFunctions,
            userDefinedMacros,
            definedVariables,
            definitions
        };
    }

    private resolveContent(lines: string[], documentUri: vscode.Uri): { expandedLines: string[], sourceMap: Map<number, number> } {
        const expandedLines: string[] = [];
        const sourceMap = new Map<number, number>(); // Maps expanded line number to original line number
        const macros = new Map<string, { params: string[], content: string[] }>();
        let currentMacro: string | null = null;
        let macroContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const originalLineNumber = i;

            // Handle macro definitions
            if (line.startsWith('#def ')) {
                const macroMatch = this.parseMacroDefinition(line);
                if (macroMatch) {
                    if (macroMatch.isInline) {
                        // Inline macro: store directly
                        macros.set(macroMatch.name, { params: macroMatch.params, content: [macroMatch.content] });
                    } else {
                        // Multiline macro: start collecting
                        currentMacro = macroMatch.name;
                        macroContent = [];
                        macros.set(macroMatch.name, { params: macroMatch.params, content: [] });
                    }
                }
                continue;
            }

            // Handle end of multiline macro
            if (line === '#end def' && currentMacro) {
                macros.get(currentMacro)!.content = [...macroContent];
                currentMacro = null;
                macroContent = [];
                continue;
            }

            // Collect macro content
            if (currentMacro) {
                macroContent.push(lines[i]); // Keep original line formatting
                continue;
            }

            // Handle includes
            if (line.startsWith('#include ')) {
                const includedLines = this.resolveInclude(line, documentUri);
                for (const includedLine of includedLines) {
                    expandedLines.push(includedLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
                }
                continue;
            }

            // Handle fetch operations
            if (line.startsWith('#fetch ')) {
                // For now, skip fetch operations as they require network access
                // In a full implementation, this would fetch remote content
                expandedLines.push(`' Fetch operation: ${line}`);
                sourceMap.set(expandedLines.length - 1, originalLineNumber);
                continue;
            }

            // Expand macros in regular lines
            let expandedLine = this.expandMacros(lines[i], macros);
            expandedLines.push(expandedLine);
            sourceMap.set(expandedLines.length - 1, originalLineNumber);
        }

        return { expandedLines, sourceMap };
    }

    private parseMacroDefinition(line: string): { name: string, params: string[], content: string, isInline: boolean } | null {
        // Inline macro: #def name$(param1$; param2$) = content
        const inlineMatch = CalcpadLinter.PATTERNS.inlineMacroDef.exec(line);
        if (inlineMatch) {
            const name = inlineMatch[1];
            const paramsStr = inlineMatch[2] || '';
            const content = inlineMatch[3];
            const params = CalcpadLinter.splitParameters(paramsStr);
            return { name, params, content, isInline: true };
        }

        // Multiline macro: #def name$(param1$; param2$)
        const multilineMatch = CalcpadLinter.PATTERNS.multilineMacroDef.exec(line);
        if (multilineMatch) {
            const name = multilineMatch[1];
            const paramsStr = multilineMatch[2] || '';
            const params = CalcpadLinter.splitParameters(paramsStr);
            return { name, params, content: '', isInline: false };
        }

        return null;
    }

    private resolveInclude(line: string, documentUri: vscode.Uri): string[] {
        const includePattern = /#include\s+([^\s]+)/;
        const match = includePattern.exec(line);
        if (!match) {
            return [`' Invalid include: ${line}`];
        }

        const filename = match[1].replace(/['"]/g, ''); // Remove quotes
        const documentDir = path.dirname(documentUri.fsPath);
        const includePath = path.resolve(documentDir, filename);

        try {
            if (fs.existsSync(includePath)) {
                const content = fs.readFileSync(includePath, 'utf8');
                return content.split('\n');
            } else {
                return [`' Include file not found: ${filename}`];
            }
        } catch (error) {
            return [`' Error reading include file: ${filename}`];
        }
    }

    private expandMacros(line: string, macros: Map<string, { params: string[], content: string[] }>): string {
        let expandedLine = line;

        // Find macro calls: macroName$ or macroName$(param1; param2)
        expandedLine = expandedLine.replace(CalcpadLinter.PATTERNS.macroCall, (match, macroName, paramsStr) => {
            const macro = macros.get(macroName);
            if (!macro) {
                return match; // Macro not found, leave as is
            }

            const actualParams = CalcpadLinter.splitParameters(paramsStr || '');
            
            if (actualParams.length !== macro.params.length) {
                return match; // Parameter count mismatch, leave as is
            }

            // Expand macro content
            let content = macro.content.join('\n');
            for (let i = 0; i < macro.params.length; i++) {
                const paramPattern = new RegExp('\\b' + macro.params[i].replace(/\$/g, '\\$') + '\\b', 'g');
                content = content.replace(paramPattern, actualParams[i]);
            }

            return content;
        });

        return expandedLine;
    }

    private collectDefinedVariables(lines: string[]): Set<string> {
        const variables = new Set<string>();
        
        for (const line of lines) {
            if (CalcpadLinter.isEmptyCommentOrDirective(line)) {
                continue;
            }
            
            // Check for variable assignments: variableName = expression
            const match = CalcpadLinter.PATTERNS.variableAssignment.exec(line.trim());
            if (match) {
                const varName = match[1];
                // Skip if it's a function definition (has parentheses)
                if (!line.includes('(') || line.indexOf('(') > line.indexOf('=')) {
                    variables.add(varName);
                }
            }
        }
        
        return variables;
    }

    private collectUserDefinedFunctions(lines: string[]): Map<string, number> {
        const userFunctions = new Map<string, number>();
        
        for (const line of lines) {
            if (CalcpadLinter.isEmptyCommentOrDirective(line)) {
                continue;
            }
            
            // Check for function definition: functionName(param1; param2; ...) = expression
            const match = CalcpadLinter.PATTERNS.functionDefinition.exec(line.trim());
            if (match) {
                const funcName = match[1];
                const params = match[2].trim();
                const paramCount = CalcpadLinter.countParameters(params);
                userFunctions.set(funcName, paramCount);
            }
        }
        
        return userFunctions;
    }

    private collectUserDefinedMacros(lines: string[]): Map<string, number> {
        const userMacros = new Map<string, number>();
        
        for (const line of lines) {
            if (CalcpadLinter.isEmptyOrComment(line)) {
                continue;
            }
            
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('#def ')) {
                continue;
            }

            const macroDefinition = this.parseMacroDefinition(trimmedLine);
            if (macroDefinition) {
                userMacros.set(macroDefinition.name, macroDefinition.params.length);
            }
        }
        
        return userMacros;
    }

    public lintDocument(document: vscode.TextDocument): void {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Get compiled/resolved content
        const compiledContent = this.getCompiledContent(document);

        // Check for unmatched control blocks first
        this.checkControlBlockBalance(lines, diagnostics);

        // Validate original source lines (syntax, structure, etc.)
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
            this.checkFunctionUsage(line, lineNumber, diagnostics, compiledContent.userDefinedFunctions);
            this.checkCommandUsage(line, lineNumber, diagnostics);
            this.checkOperatorSyntax(line, lineNumber, diagnostics);
            this.checkControlStructures(line, lineNumber, diagnostics);
            this.checkKeywordValidation(line, lineNumber, diagnostics);
            this.checkAssignments(line, lineNumber, diagnostics);
            this.checkMacroSyntax(line, lineNumber, diagnostics);
            this.checkMacroUsage(line, lineNumber, diagnostics, compiledContent.userDefinedMacros);
            this.checkUnits(line, lineNumber, diagnostics);
        }

        // Validate compiled content for undefined variables with proper source mapping
        this.validateCompiledContent(compiledContent, diagnostics);

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private validateCompiledContent(compiledContent: {
        expandedLines: string[],
        sourceMap: Map<number, number>,
        userDefinedFunctions: Map<string, number>,
        userDefinedMacros: Map<string, number>,
        definedVariables: Set<string>,
        definitions: DefinitionCollector
    }, diagnostics: vscode.Diagnostic[]): void {
        
        // Check undefined variables in compiled content
        for (let i = 0; i < compiledContent.expandedLines.length; i++) {
            const expandedLine = compiledContent.expandedLines[i];
            const originalLineNumber = compiledContent.sourceMap.get(i);
            
            if (originalLineNumber === undefined) {
                continue; // Skip lines that don't map back to source
            }
            
            this.checkUndefinedVariablesInCompiledLine(
                expandedLine, 
                originalLineNumber, 
                diagnostics, 
                compiledContent.definitions
            );
        }
    }

    private checkUndefinedVariablesInCompiledLine(line: string, originalLineNumber: number, diagnostics: vscode.Diagnostic[], 
                                                 definitions: DefinitionCollector): void {
        if (CalcpadLinter.isEmptyCommentOrDirective(line)) {
            return;
        }

        // Skip variable definition lines
        if (CalcpadLinter.PATTERNS.variableAssignment.test(line.trim())) {
            return;
        }

        // Find variable/identifier references
        CalcpadLinter.PATTERNS.identifier.lastIndex = 0; // Reset regex state
        let match;

        while ((match = CalcpadLinter.PATTERNS.identifier.exec(line)) !== null) {
            const identifier = match[1];
            const identifierPos = match.index;

            // Skip if it's followed by parentheses (function call)
            const nextCharIndex = match.index + identifier.length;
            const nextChar = line[nextCharIndex];
            if (nextChar === '(' || (nextChar === ' ' && line[nextCharIndex + 1] === '(')) {
                continue; // This is handled by function validation
            }

            // Skip numbers and operators
            if (/^\d/.test(identifier) || this.operators.test(identifier)) {
                continue;
            }

            // Use centralized identifier checking
            const identifierInfo = this.isKnownIdentifier(identifier, definitions);
            
            if (!identifierInfo.isKnown) {
                // Handle special case for macros
                if (identifier.endsWith('$') && !definitions.getAllMacros().has(identifier)) {
                    const range = new vscode.Range(originalLineNumber, identifierPos, originalLineNumber, identifierPos + identifier.length);
                    const suggestions = this.getSuggestionsFromCollector(identifier, definitions);
                    const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
                    
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Undefined macro '${identifier}' (found in expanded content).${suggestionText}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                } else if (!identifier.endsWith('$')) {
                    // Regular undefined variable
                    const range = new vscode.Range(originalLineNumber, identifierPos, originalLineNumber, identifierPos + identifier.length);
                    const suggestions = this.getSuggestionsFromCollector(identifier, definitions);
                    const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';

                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Undefined variable '${identifier}' (found in expanded content).${suggestionText}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
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
                    // Special case: inline macro/string definitions with #def don't need #end def
                    if (keyword === 'def' && trimmedLine.includes('=')) {
                        // This is an inline macro definition, skip adding to block stack
                        continue;
                    }
                    
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

    private checkFunctionUsage(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[], userDefinedFunctions: Map<string, number>): void {
        // Check for function calls with missing parentheses or incorrect syntax
        const functionCallPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
        let match;

        while ((match = functionCallPattern.exec(line)) !== null) {
            const funcName = match[1];
            const paramsString = match[2].trim();

            // Check if it's an unknown function (not built-in or user-defined)
            if (!this.builtInFunctions.has(funcName.toLowerCase()) && 
                !this.controlKeywords.has(funcName.toLowerCase()) && 
                !userDefinedFunctions.has(funcName)) {
                const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + funcName.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Unknown function '${funcName}'`,
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Check parameter count for user-defined functions
            if (userDefinedFunctions.has(funcName)) {
                const expectedParams = userDefinedFunctions.get(funcName)!;
                const actualParams = paramsString === '' ? 0 : paramsString.split(';').filter(p => p.trim()).length;
                
                if (actualParams !== expectedParams) {
                    const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Function '${funcName}' expects ${expectedParams} parameter${expectedParams !== 1 ? 's' : ''} but got ${actualParams}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
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
        return this.getSimilarIdentifiers(keyword, this.validHashKeywords, '#');
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

        // Check assignment expressions for invalid bare identifiers
        this.checkAssignmentExpressions(line, lineNumber, diagnostics);
    }

    private checkAssignmentExpressions(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Skip lines that don't contain assignments
        if (!line.includes('=') || line.trim().startsWith('#') || line.trim().startsWith('"') || line.trim().startsWith("'")) {
            return;
        }

        // Check if this is a function definition: functionName(param1; param2; ...) = expression
        const functionDefPattern = /([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*)\s*\([^)]*\)\s*=\s*(.+)/;
        if (functionDefPattern.test(line)) {
            // This is a function definition, skip validation of the right-hand side for now
            // We could add validation for function definitions later if needed
            return;
        }

        // Pattern to match variable assignments: variableName = expression
        const assignmentPattern = /([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$?)\s*=\s*(.+)/g;
        let match;

        while ((match = assignmentPattern.exec(line)) !== null) {
            const variableName = match[1];
            const expression = match[2].trim();
            const expressionStartPos = match.index + match[0].indexOf(expression);

            // Validate the right-hand side expression
            this.validateAssignmentExpression(expression, expressionStartPos, lineNumber, diagnostics);
        }
    }

    private validateAssignmentExpression(expression: string, startPos: number, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        // Remove comments from the expression
        const cleanExpr = expression.split(/['"]/)[0].trim();
        
        // Skip empty expressions
        if (!cleanExpr) {
            return;
        }

        // Note: Assignment expression validation is now handled by checkUndefinedVariables
        // which uses the compiled content for more accurate validation
    }


    private checkMacroSyntax(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (trimmedLine === '' || trimmedLine.startsWith('"') || trimmedLine.startsWith("'")) {
            return;
        }

        // Check for #def macro definitions
        if (trimmedLine.startsWith('#def ')) {
            this.checkMacroDefinition(line, lineNumber, diagnostics);
        }
    }

    private checkMacroDefinition(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[]): void {
        const trimmedLine = line.trim();
        
        // Check for inline macro definition: #def name$ = content
        const inlineMacroPattern = /#def\s+([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*)\s*=\s*(.+)/;
        const inlineMatch = inlineMacroPattern.exec(trimmedLine);
        
        if (inlineMatch) {
            const macroName = inlineMatch[1];
            if (!macroName.endsWith('$')) {
                const macroStartPos = line.indexOf(macroName);
                const range = new vscode.Range(lineNumber, macroStartPos, lineNumber, macroStartPos + macroName.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Macro name '${macroName}' should end with '$'`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
            return;
        }

        // Check for multiline macro definition: #def name$ or #def name$(param1$; param2$; ...)
        const multilineMacroPattern = /#def\s+([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*(?:\([^)]*\))?)\s*$/;
        const multilineMatch = multilineMacroPattern.exec(trimmedLine);
        
        if (multilineMatch) {
            const macroDeclaration = multilineMatch[1];
            
            // Check if it's a macro with parameters
            const macroWithParamsPattern = /^([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*)\(([^)]*)\)$/;
            const paramMatch = macroWithParamsPattern.exec(macroDeclaration);
            
            if (paramMatch) {
                // Macro with parameters
                const macroName = paramMatch[1];
                const params = paramMatch[2];
                
                // Check macro name ends with $
                if (!macroName.endsWith('$')) {
                    const macroStartPos = line.indexOf(macroName);
                    const range = new vscode.Range(lineNumber, macroStartPos, lineNumber, macroStartPos + macroName.length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Macro name '${macroName}' should end with '$'`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                
                // Check each parameter ends with $
                if (params.trim()) {
                    const paramList = params.split(';').map(p => p.trim());
                    for (const param of paramList) {
                        if (param && !param.endsWith('$')) {
                            const paramStartPos = line.indexOf(param);
                            if (paramStartPos !== -1) {
                                const range = new vscode.Range(lineNumber, paramStartPos, lineNumber, paramStartPos + param.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `Macro parameter '${param}' should end with '$'`,
                                    vscode.DiagnosticSeverity.Error
                                ));
                            }
                        }
                    }
                }
            } else {
                // Simple macro without parameters
                const macroName = macroDeclaration;
                if (!macroName.endsWith('$')) {
                    const macroStartPos = line.indexOf(macroName);
                    const range = new vscode.Range(lineNumber, macroStartPos, lineNumber, macroStartPos + macroName.length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Macro name '${macroName}' should end with '$'`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
    }

    private checkMacroUsage(line: string, lineNumber: number, diagnostics: vscode.Diagnostic[], userDefinedMacros: Map<string, number>): void {
        // Skip macro definition lines
        if (line.trim().startsWith('#def ')) {
            return;
        }

        // Check for macro calls: macroName$ or macroName$(param1; param2; ...)
        const macroCallPattern = /\b([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$)(?:\(([^)]*)\))?/g;
        let match;

        while ((match = macroCallPattern.exec(line)) !== null) {
            const macroName = match[1];
            const paramsString = match[2] || '';

            // Check if this is a defined macro
            if (userDefinedMacros.has(macroName)) {
                const expectedParams = userDefinedMacros.get(macroName)!;
                const actualParams = paramsString.trim() === '' ? 0 : paramsString.split(';').filter(p => p.trim()).length;
                
                if (actualParams !== expectedParams) {
                    const range = new vscode.Range(lineNumber, match.index, lineNumber, match.index + match[0].length);
                    const message = expectedParams === 0 
                        ? `Macro '${macroName}' expects no parameters but got ${actualParams}`
                        : `Macro '${macroName}' expects ${expectedParams} parameter${expectedParams !== 1 ? 's' : ''} but got ${actualParams}`;
                    
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        message,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
    }


    private getSuggestionsForUndefinedVariable(identifier: string, 
                                             definedVariables: Set<string>, 
                                             userDefinedFunctions: Map<string, number>, 
                                             userDefinedMacros: Map<string, number>): string[] {
        const allSuggestions: string[] = [];
        
        // Check against defined variables
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, definedVariables));
        
        // Check against user-defined functions
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, userDefinedFunctions.keys(), '()'));
        
        // Check against user-defined macros
        allSuggestions.push(...this.getSimilarIdentifiers(identifier, userDefinedMacros.keys()));
        
        return allSuggestions.slice(0, 3); // Return max 3 suggestions
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