import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CalcpadSettingsManager } from './calcpadSettings';
import { CalcpadContentResolver } from './calcpadContentResolver';

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

// Interface for parsed line segments
interface ParsedLine {
    codeSegments: Array<{text: string, startPos: number, lineNumber: number}>;
    stringSegments: Array<{text: string, startPos: number, endPos: number, lineNumber: number}>;
    lineNumber: number;
    originalLine: string;
}

export class CalcpadLinter {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    private contentResolver: CalcpadContentResolver;

    // Common regex patterns used throughout the linter
    private static readonly IDENTIFIER_CHARS = 'a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻$';
    private static readonly IDENTIFIER_START_CHARS = 'a-zA-Zα-ωΑ-Ω°øØ∡';
    
    // Regex patterns for common identifier types
    private static readonly PATTERNS = {
        // Basic identifier (variable/function name) - capture full identifier including $ suffix
        // Use negative lookbehind/lookahead to ensure proper word boundaries without excluding $
        identifier: new RegExp(`(?<![${CalcpadLinter.IDENTIFIER_CHARS}])([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*)(?![${CalcpadLinter.IDENTIFIER_CHARS}])`, 'g'),
        
        // Variable assignment pattern
        variableAssignment: new RegExp(`^([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*)\\s*=`),
        
        // Function definition pattern  
        functionDefinition: new RegExp(`^([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*)\\s*\\(([^)]*)\\)\\s*=`),
        
        // Macro name pattern (with optional $)
        macroName: new RegExp(`([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$?)`),
        
        // Macro call pattern
        macroCall: new RegExp(`\\b([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$)(?:\\(([^)]*)\\))?`, 'g'),
        
        // Inline macro definition
        inlineMacroDef: new RegExp(`#def\\s+([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*)(?:\\(([^)]*)\\))?\\s*=\\s*(.+)`),
        
        // Multiline macro definition
        multilineMacroDef: new RegExp(`#def\\s+([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*)(?:\\(([^)]*)\\))?\\s*$`)
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

    constructor(settingsManager: CalcpadSettingsManager) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('calcpad');
        this.outputChannel = vscode.window.createOutputChannel('CalcPad Linter Debug');
        this.contentResolver = new CalcpadContentResolver(settingsManager, this.outputChannel);
    }

    public getContentResolver(): CalcpadContentResolver {
        return this.contentResolver;
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

    private hasMacroCalls(lines: string[]): boolean {
        let inMacroDefinition = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Track macro definition blocks
            if (trimmed.startsWith('#def ')) {
                // Check if it's an inline macro (has = sign)
                const inlineMacroMatch = CalcpadLinter.PATTERNS.inlineMacroDef.exec(trimmed);
                if (!inlineMacroMatch) {
                    // Multiline macro definition starts
                    inMacroDefinition = true;
                }
                continue;
            }
            
            if (trimmed === '#end def') {
                inMacroDefinition = false;
                continue;
            }
            
            // Skip lines inside macro definitions
            if (inMacroDefinition) {
                continue;
            }
            
            // Look for macro calls (identifiers ending with $, but not in definitions)
            const macroCallRegex = new RegExp(`\\b([${CalcpadLinter.IDENTIFIER_START_CHARS}][${CalcpadLinter.IDENTIFIER_CHARS}]*\\$)`, 'g');
            if (macroCallRegex.test(trimmed)) {
                return true;
            }
        }
        
        return false;
    }

    private needsComplexResolution(lines: string[]): boolean {
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Check for includes
            if (trimmed.startsWith('#include ')) {
                return true;
            }
            
            // Check for fetch operations
            if (trimmed.startsWith('#fetch ')) {
                return true;
            }
            
            // Check for macro definitions (both inline and multiline)
            if (trimmed.startsWith('#def ')) {
                return true;
            }
        }
        
        // Check for macro calls (but not definitions)
        if (this.hasMacroCalls(lines)) {
            return true;
        }
        
        return false;
    }

    public getCompiledContent(document: vscode.TextDocument): {
        expandedLines: string[],
        sourceMap: Map<number, number>,
        macroExpansionLines: Map<number, string>,
        lineContinuationMap: Map<number, number[]>,
        userDefinedFunctions: Map<string, number>,
        userDefinedMacros: Map<string, number>,
        definedVariables: Set<string>,
        definitions: DefinitionCollector
    } {
        const text = document.getText();
        let lines = text.split('\n');

        // Process line continuations first (before any other processing)
        const { processedLines, lineContinuationMap } = this.processLineContinuations(lines);
        this.outputChannel.appendLine(`[DEBUG] Line continuation processing:`);
        this.outputChannel.appendLine(`  Original lines: ${lines.length}, Processed lines: ${processedLines.length}`);
        for (const [processedIndex, originalIndices] of lineContinuationMap.entries()) {
            if (originalIndices.length > 1) {
                this.outputChannel.appendLine(`  Line ${processedIndex}: "${processedLines[processedIndex]}" (from original lines ${originalIndices.join(', ')})`);
            }
        }
        lines = processedLines;

        // Check if file needs complex resolution (has includes, fetch, or macros)
        const needsComplexResolution = this.needsComplexResolution(lines);
        this.outputChannel.appendLine(`[DEBUG] needsComplexResolution: ${needsComplexResolution}`);

        let expandedLines: string[];
        let sourceMap: Map<number, number>;
        let macroExpansionLines: Map<number, string>;

        if (needsComplexResolution) {
            // Content resolution: expand includes, macros, and fetch operations
            this.outputChannel.appendLine(`[DEBUG] Using complex resolution for ${lines.length} lines`);
            const resolvedContent = this.resolveContent(lines, document.uri);
            expandedLines = resolvedContent.expandedLines;
            sourceMap = resolvedContent.sourceMap;
            macroExpansionLines = resolvedContent.macroExpansionLines;
            
            // Adjust source map to account for line continuations
            sourceMap = this.adjustSourceMapForLineContinuations(sourceMap, lineContinuationMap);
            this.outputChannel.appendLine(`[DEBUG] Expanded to ${expandedLines.length} lines:`);
            expandedLines.forEach((line, i) => {
                this.outputChannel.appendLine(`  [${i}]: ${line}`);
            });
        } else {
            // Simple mode: use original lines with line continuation mapping
            expandedLines = [...lines];
            sourceMap = new Map<number, number>();
            macroExpansionLines = new Map<number, string>();
            
            // Create source mapping that accounts for line continuations
            for (let i = 0; i < lines.length; i++) {
                const continuationOriginalLines = lineContinuationMap.get(i);
                if (continuationOriginalLines && continuationOriginalLines.length > 0) {
                    sourceMap.set(i, continuationOriginalLines[0]);
                    this.outputChannel.appendLine(`[DEBUG] Line mapping: processed line ${i} → original line ${continuationOriginalLines[0]} (from continuation ${continuationOriginalLines.join(', ')})`);
                } else {
                    sourceMap.set(i, i);
                    this.outputChannel.appendLine(`[DEBUG] Line mapping: processed line ${i} → original line ${i} (no continuation)`);
                }
            }
        }

        // Collect definitions from resolved content
        const userDefinedFunctions = this.collectUserDefinedFunctions(expandedLines);
        const userDefinedMacros = this.collectUserDefinedMacros(expandedLines);
        const definedVariables = this.collectDefinedVariables(expandedLines);
        
        // Create centralized definition collector
        const definitions = this.createDefinitionCollector(expandedLines);

        return {
            expandedLines,
            sourceMap,
            macroExpansionLines,
            lineContinuationMap,
            userDefinedFunctions,
            userDefinedMacros,
            definedVariables,
            definitions
        };
    }

    private resolveContent(lines: string[], documentUri: vscode.Uri): { expandedLines: string[], sourceMap: Map<number, number>, macroExpansionLines: Map<number, string> } {
        const expandedLines: string[] = [];
        const sourceMap = new Map<number, number>(); // Maps expanded line number to original line number
        const macroExpansionLines = new Map<number, string>(); // Maps expanded line number to original macro call
        const macros = new Map<string, { params: string[], content: string[] }>();
        let currentMacro: string | null = null;
        let macroContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const originalLineNumber = i;

            // Handle macro definitions
            if (line.startsWith('#def ')) {
                this.outputChannel.appendLine(`[DEBUG] Processing macro definition: "${line}"`);
                const macroMatch = this.parseMacroDefinition(line);
                if (macroMatch) {
                    if (macroMatch.isInline) {
                        // Inline macro: store directly
                        this.outputChannel.appendLine(`[DEBUG] Storing inline macro: ${macroMatch.name}`);
                        macros.set(macroMatch.name, { params: macroMatch.params, content: [macroMatch.content] });
                    } else {
                        // Multiline macro: start collecting
                        this.outputChannel.appendLine(`[DEBUG] Starting multiline macro: ${macroMatch.name}`);
                        currentMacro = macroMatch.name;
                        macroContent = [];
                        macros.set(macroMatch.name, { params: macroMatch.params, content: [] });
                    }
                } else {
                    this.outputChannel.appendLine(`[DEBUG] Failed to parse macro definition`);
                }
                continue;
            }

            // Handle end of multiline macro
            if (line === '#end def' && currentMacro) {
                this.outputChannel.appendLine(`[DEBUG] Ending multiline macro: ${currentMacro}, content: [${macroContent.join(', ')}]`);
                macros.get(currentMacro)!.content = [...macroContent];
                currentMacro = null;
                macroContent = [];
                continue;
            }

            // Collect macro content
            if (currentMacro) {
                this.outputChannel.appendLine(`[DEBUG] Adding content to macro ${currentMacro}: "${lines[i]}"`);
                macroContent.push(lines[i]); // Keep original line formatting
                continue;
            }

            // Handle includes
            if (line.startsWith('#include ')) {
                this.outputChannel.appendLine(`[DEBUG] Processing include: ${line}`);
                const includedLines = this.resolveInclude(line, documentUri);
                this.outputChannel.appendLine(`[DEBUG] Include resolved to ${includedLines.length} lines`);
                for (const includedLine of includedLines) {
                    expandedLines.push(includedLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
                }
                continue;
            }


            // Expand macros in regular lines
            if (expandedLines.length === 0) {
                this.outputChannel.appendLine(`[DEBUG] Final macro map before expansion:`);
                for (const [name, macro] of macros.entries()) {
                    this.outputChannel.appendLine(`  ${name}: params=[${macro.params.join(', ')}], content=[${macro.content.join(' | ')}]`);
                }
            }
            let expandedLine = this.expandMacros(lines[i], macros);
            const isFromMacroExpansion = expandedLine !== lines[i];
            
            // Handle multiline expansions
            if (expandedLine.includes('\n')) {
                const expandedSubLines = expandedLine.split('\n');
                for (const subLine of expandedSubLines) {
                    expandedLines.push(subLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
                    // Mark lines that came from macro expansions
                    if (isFromMacroExpansion) {
                        macroExpansionLines.set(expandedLines.length - 1, lines[i]);
                    }
                }
            } else {
                expandedLines.push(expandedLine);
                sourceMap.set(expandedLines.length - 1, originalLineNumber);
                // Mark lines that came from macro expansions
                if (isFromMacroExpansion) {
                    macroExpansionLines.set(expandedLines.length - 1, lines[i]);
                }
            }
        }

        return { expandedLines, sourceMap, macroExpansionLines };
    }

    private parseMacroDefinition(line: string): { name: string, params: string[], content: string, isInline: boolean } | null {
        this.outputChannel.appendLine(`[DEBUG] parseMacroDefinition: "${line}"`);
        
        // Inline macro: #def name$(param1$; param2$) = content
        const inlineMatch = CalcpadLinter.PATTERNS.inlineMacroDef.exec(line);
        if (inlineMatch) {
            const name = inlineMatch[1];
            const paramsStr = inlineMatch[2] || '';
            const content = inlineMatch[3];
            const params = CalcpadLinter.splitParameters(paramsStr);
            this.outputChannel.appendLine(`[DEBUG] Parsed inline macro: name="${name}", params=[${params.join(', ')}], content="${content}"`);
            return { name, params, content, isInline: true };
        }

        // Multiline macro: #def name$(param1$; param2$)
        const multilineMatch = CalcpadLinter.PATTERNS.multilineMacroDef.exec(line);
        if (multilineMatch) {
            const name = multilineMatch[1];
            const paramsStr = multilineMatch[2] || '';
            const params = CalcpadLinter.splitParameters(paramsStr);
            this.outputChannel.appendLine(`[DEBUG] Parsed multiline macro: name="${name}", params=[${params.join(', ')}]`);
            return { name, params, content: '', isInline: false };
        }

        this.outputChannel.appendLine(`[DEBUG] No macro definition found in line`);
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
        this.outputChannel.appendLine(`[DEBUG] expandMacros input: "${line}"`);
        this.outputChannel.appendLine(`[DEBUG] Available macros: ${Array.from(macros.keys()).join(', ')}`);

        // Find macro calls: macroName$ or macroName$(param1; param2)
        expandedLine = expandedLine.replace(CalcpadLinter.PATTERNS.macroCall, (match, macroName, paramsStr) => {
            this.outputChannel.appendLine(`[DEBUG] Found macro call: ${match}, name: ${macroName}, params: ${paramsStr}`);
            const macro = macros.get(macroName);
            if (!macro) {
                this.outputChannel.appendLine(`[DEBUG] Macro ${macroName} not found in definitions`);
                return match; // Macro not found, leave as is
            }

            const actualParams = CalcpadLinter.splitParameters(paramsStr || '');
            this.outputChannel.appendLine(`[DEBUG] Macro ${macroName} found, expected params: [${macro.params.join(', ')}], actual: [${actualParams.join(', ')}]`);
            
            if (actualParams.length !== macro.params.length) {
                this.outputChannel.appendLine(`[DEBUG] Parameter count mismatch for ${macroName}`);
                return match; // Parameter count mismatch, leave as is
            }

            // Expand macro content
            let content = macro.content.join('\n');
            this.outputChannel.appendLine(`[DEBUG] Macro content before substitution: "${content}"`);
            for (let i = 0; i < macro.params.length; i++) {
                // Direct string replacement of parameter names
                const paramName = macro.params[i];
                const argValue = actualParams[i];
                const escapedParamName = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                content = content.replace(new RegExp(escapedParamName, 'g'), argValue);
                this.outputChannel.appendLine(`[DEBUG] After replacing ${paramName} with ${argValue}: "${content}"`);
            }

            this.outputChannel.appendLine(`[DEBUG] Final expanded content: "${content}"`);
            return content;
        });

        this.outputChannel.appendLine(`[DEBUG] expandMacros output: "${expandedLine}"`);
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
                    this.outputChannel.appendLine(`[DEBUG] Collected variable: ${varName} from line: "${line}"`);
                }
            }
        }
        
        this.outputChannel.appendLine(`[DEBUG] Total variables collected: [${Array.from(variables).join(', ')}]`);
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

    public async lintDocument(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Pre-cache all fetch content before linting
        await this.contentResolver.preCacheContent(lines);

        // Parse all lines into code and string segments upfront
        const parsedLines = lines.map((line, index) => this.extractCodeAndStrings(line, index));

        // Get compiled/resolved content
        const compiledContent = this.contentResolver.getCompiledContent(document);

        // Check for unmatched control blocks first
        this.checkControlBlockBalance(lines, diagnostics);

        // Validate original source lines (syntax, structure, etc.)
        // Track macro context as we process lines
        let currentMacroContext: {name: string, params: string[]} | undefined = undefined;
        
        // Lint the expanded/resolved content instead of original lines
        for (let i = 0; i < compiledContent.expandedLines.length; i++) {
            const expandedLine = compiledContent.expandedLines[i];
            const originalLineNumber = compiledContent.sourceMap.get(i) ?? 0;
            const originalMacroCall = compiledContent.macroExpansionLines.get(i);
            const parsedLine = this.extractCodeAndStrings(expandedLine, originalLineNumber);
            
            // Track macro definition boundaries
            const trimmedLine = expandedLine.trim();
            let lineMacroContext: {name: string, params: string[]} | undefined = currentMacroContext;
            
            if (trimmedLine.startsWith('#def ')) {
                // Parse macro definition to get parameters
                const macroMatch = /^#def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\(\s*([^)]*)\s*\))?(?:\s*=\s*(.+))?/.exec(trimmedLine);
                if (macroMatch) {
                    const macroName = macroMatch[1];
                    const paramsStr = macroMatch[2] || '';
                    const macroContent = macroMatch[3]; // Content after = for inline macros
                    const params = CalcpadLinter.splitParameters(paramsStr);
                    
                    if (macroContent) {
                        // Inline macro - context applies only to this line
                        lineMacroContext = { name: macroName, params };
                        this.outputChannel.appendLine(`[DEBUG] Inline macro context: ${macroName} with params: [${params.join(', ')}]`);
                    } else {
                        // Multiline macro - context applies until #end def
                        currentMacroContext = { name: macroName, params };
                        lineMacroContext = currentMacroContext;
                        this.outputChannel.appendLine(`[DEBUG] Entering multiline macro context: ${macroName} with params: [${params.join(', ')}]`);
                    }
                }
            } else if (trimmedLine === '#end def') {
                this.outputChannel.appendLine(`[DEBUG] Exiting macro context: ${currentMacroContext?.name || 'unknown'}`);
                currentMacroContext = undefined;
                lineMacroContext = undefined;
            }
            
            this.outputChannel.appendLine(`[DEBUG] Linting line ${i}: "${expandedLine}" → mapped to original line ${originalLineNumber}`);

            // Skip empty lines and comments
            if (expandedLine.trim() === '' || expandedLine.trim().startsWith('"') || expandedLine.trim().startsWith("'")) {
                continue;
            }

            // Store diagnostics count before checking this line
            const diagnosticsCountBefore = diagnostics.length;
            
            // Check if this line came from line continuation
            const lineContinuationOriginalLines = compiledContent.lineContinuationMap.get(i);
            const isFromLineContinuation = lineContinuationOriginalLines && lineContinuationOriginalLines.length > 1;

            // If this line came from macro expansion, highlight the original macro call instead
            if (originalMacroCall) {
                // Lint expanded content but report errors on the original macro line
                const macroLineDiagnostics: vscode.Diagnostic[] = [];
                
                // Run all checks on the expanded content but capture diagnostics separately
                this.checkParenthesesBalance(parsedLine, macroLineDiagnostics);
                this.checkBracketBalance(parsedLine, macroLineDiagnostics);  
                this.checkVariableNaming(parsedLine, macroLineDiagnostics);
                this.checkFunctionDefinition(parsedLine, macroLineDiagnostics);
                this.checkFunctionUsage(parsedLine, macroLineDiagnostics, compiledContent.userDefinedFunctions);
                this.checkCommandUsage(parsedLine, macroLineDiagnostics);
                this.checkOperatorSyntax(parsedLine, macroLineDiagnostics);
                this.checkControlStructures(parsedLine, macroLineDiagnostics);
                this.checkKeywordValidation(parsedLine, macroLineDiagnostics);
                this.checkAssignments(parsedLine, macroLineDiagnostics);
                this.checkMacroSyntax(parsedLine, macroLineDiagnostics);
                this.checkUnits(parsedLine, macroLineDiagnostics);
                const definitions = this.createDefinitionCollector(compiledContent.expandedLines);
                this.checkUndefinedVariablesInCompiledLine(expandedLine, originalLineNumber, macroLineDiagnostics, definitions, lineMacroContext);

                // Convert any diagnostics to highlight the entire macro call
                for (const macroDiagnostic of macroLineDiagnostics) {
                    const macroCallRange = this.findMacroCallRange(originalMacroCall, originalLineNumber);
                    const adjustedDiagnostic = new vscode.Diagnostic(
                        macroCallRange,
                        `Macro expansion error: ${macroDiagnostic.message}`,
                        macroDiagnostic.severity
                    );
                    diagnostics.push(adjustedDiagnostic);
                }
            } else {
                // Normal line - lint as usual
                this.checkParenthesesBalance(parsedLine, diagnostics);
                this.checkBracketBalance(parsedLine, diagnostics);  
                this.checkVariableNaming(parsedLine, diagnostics);
                this.checkFunctionDefinition(parsedLine, diagnostics);
                this.checkFunctionUsage(parsedLine, diagnostics, compiledContent.userDefinedFunctions);
                this.checkCommandUsage(parsedLine, diagnostics);
                this.checkOperatorSyntax(parsedLine, diagnostics);
                this.checkControlStructures(parsedLine, diagnostics);
                this.checkKeywordValidation(parsedLine, diagnostics);
                this.checkAssignments(parsedLine, diagnostics);
                this.checkMacroSyntax(parsedLine, diagnostics);
                this.checkMacroUsage(expandedLine, originalLineNumber, diagnostics, compiledContent.userDefinedMacros);
                this.checkUnits(parsedLine, diagnostics);
                const definitions = this.createDefinitionCollector(compiledContent.expandedLines);
                this.checkUndefinedVariablesInCompiledLine(expandedLine, originalLineNumber, diagnostics, definitions, lineMacroContext);
            }
            
            // If this line came from line continuation and we added new diagnostics, adjust their ranges
            if (isFromLineContinuation && diagnostics.length > diagnosticsCountBefore) {
                this.adjustDiagnosticsForLineContinuation(diagnostics, diagnosticsCountBefore, i, compiledContent.lineContinuationMap);
            }
        }


        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private processLineContinuations(lines: string[]): { processedLines: string[], lineContinuationMap: Map<number, number[]> } {
        const processedLines: string[] = [];
        const lineContinuationMap = new Map<number, number[]>(); // Maps processed line index to original line numbers
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const originalLineNumbers = [i]; // Start with current line number
            
            // Check if this line ends with line continuation: whitespace + _ + whitespace (+ optional comment)
            const lineContinuationPattern = /\s+_\s*(?:'.*|".*)?$/;
            
            if (lineContinuationPattern.test(line)) {
                // This line has continuation, start building the combined line
                let combinedLine = line.replace(lineContinuationPattern, ''); // Remove the _ and trailing whitespace
                let nextLineIndex = i + 1;
                
                // Keep collecting continuation lines
                while (nextLineIndex < lines.length) {
                    const nextLine = lines[nextLineIndex];
                    originalLineNumbers.push(nextLineIndex);
                    
                    // Check if the next line also has continuation
                    if (lineContinuationPattern.test(nextLine)) {
                        // Remove continuation marker and add to combined line
                        combinedLine += ' ' + nextLine.replace(lineContinuationPattern, '').trim();
                        nextLineIndex++;
                    } else {
                        // Last line of continuation
                        combinedLine += ' ' + nextLine.trim();
                        break;
                    }
                }
                
                // Add the combined line
                processedLines.push(combinedLine);
                lineContinuationMap.set(processedLines.length - 1, originalLineNumbers);
                
                // Skip the lines we just processed
                i = nextLineIndex;
            } else {
                // Regular line, no continuation
                processedLines.push(line);
                lineContinuationMap.set(processedLines.length - 1, originalLineNumbers);
            }
        }
        
        return { processedLines, lineContinuationMap };
    }

    private adjustSourceMapForLineContinuations(sourceMap: Map<number, number>, lineContinuationMap: Map<number, number[]>): Map<number, number> {
        const adjustedSourceMap = new Map<number, number>();
        
        for (const [expandedLineIndex, originalLineIndex] of sourceMap.entries()) {
            // Check if the original line index corresponds to a line continuation
            const continuationOriginalLines = lineContinuationMap.get(originalLineIndex);
            if (continuationOriginalLines && continuationOriginalLines.length > 0) {
                // Use the first original line from the continuation
                adjustedSourceMap.set(expandedLineIndex, continuationOriginalLines[0]);
            } else {
                // No continuation, use the original mapping
                adjustedSourceMap.set(expandedLineIndex, originalLineIndex);
            }
        }
        
        return adjustedSourceMap;
    }

    private adjustDiagnosticsForLineContinuation(diagnostics: vscode.Diagnostic[], startIndex: number, processedLineIndex: number, lineContinuationMap: Map<number, number[]>): void {
        // Get the original line numbers that make up this continuation
        const lineContinuationOriginalLines = lineContinuationMap.get(processedLineIndex);
        if (!lineContinuationOriginalLines || lineContinuationOriginalLines.length <= 1) {
            return; // No continuation to adjust
        }

        // For any diagnostics added after startIndex, create diagnostics for all continuation lines
        const originalDiagnostics = diagnostics.slice(startIndex);
        
        // Remove the original diagnostics
        diagnostics.splice(startIndex);
        
        // Add diagnostics for each line in the continuation
        for (const originalDiagnostic of originalDiagnostics) {
            for (let i = 0; i < lineContinuationOriginalLines.length; i++) {
                const originalLineNumber = lineContinuationOriginalLines[i];
                
                // Create a range that spans the entire line
                const fullLineRange = new vscode.Range(originalLineNumber, 0, originalLineNumber, Number.MAX_SAFE_INTEGER);
                
                // Create message based on position in continuation
                let message;
                if (i === 0) {
                    message = `Line continuation error: ${originalDiagnostic.message}`;
                } else {
                    message = `Line continuation (continued from above): ${originalDiagnostic.message}`;
                }
                
                const adjustedDiagnostic = new vscode.Diagnostic(
                    fullLineRange,
                    message,
                    originalDiagnostic.severity
                );
                
                diagnostics.push(adjustedDiagnostic);
            }
        }
    }

    private findMacroCallRange(originalMacroCall: string, lineNumber: number): vscode.Range {
        // Find the macro call pattern in the original line
        const macroCallMatch = CalcpadLinter.PATTERNS.macroCall.exec(originalMacroCall);
        if (macroCallMatch && macroCallMatch.index !== undefined) {
            const startPos = macroCallMatch.index;
            const endPos = startPos + macroCallMatch[0].length;
            return new vscode.Range(lineNumber, startPos, lineNumber, endPos);
        }
        
        // Fallback: highlight the entire line
        return new vscode.Range(lineNumber, 0, lineNumber, originalMacroCall.length);
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
            
            const definitions = this.createDefinitionCollector(compiledContent.expandedLines);
            this.checkUndefinedVariablesInCompiledLine(
                expandedLine, 
                originalLineNumber, 
                diagnostics, 
                definitions,
                undefined // No macro context in this case
            );
        }
    }

    private extractCodeAndStrings(line: string, lineNumber: number): ParsedLine {
        const codeSegments: Array<{text: string, startPos: number, lineNumber: number}> = [];
        const stringSegments: Array<{text: string, startPos: number, endPos: number, lineNumber: number}> = [];
        
        let inString = false;
        let stringQuote = '';
        let stringStart = 0;
        let lastCodeEnd = 0;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (!inString) {
                if (char === '"' || char === "'") {
                    // Save code segment before string
                    if (i > lastCodeEnd) {
                        const codeText = line.slice(lastCodeEnd, i);
                        if (codeText.trim()) {
                            codeSegments.push({
                                text: codeText,
                                startPos: lastCodeEnd,
                                lineNumber: lineNumber
                            });
                        }
                    }
                    
                    inString = true;
                    stringQuote = char;
                    stringStart = i;
                }
            } else {
                if (char === stringQuote) {
                    // Check if this is an escaped quote ('' or "")
                    const nextChar = line[i + 1];
                    if (nextChar === stringQuote) {
                        // Escaped quote - skip both characters
                        i++; // Skip the second quote
                        continue;
                    } else {
                        // String ends
                        const stringText = line.slice(stringStart, i + 1);
                        stringSegments.push({
                            text: stringText,
                            startPos: stringStart,
                            endPos: i + 1,
                            lineNumber: lineNumber
                        });
                        
                        inString = false;
                        stringQuote = '';
                        lastCodeEnd = i + 1;
                    }
                }
            }
        }
        
        // Add remaining code segment
        if (!inString && lastCodeEnd < line.length) {
            const codeText = line.slice(lastCodeEnd);
            if (codeText.trim()) {
                codeSegments.push({
                    text: codeText,
                    startPos: lastCodeEnd,
                    lineNumber: lineNumber
                });
            }
        }
        
        return { 
            codeSegments, 
            stringSegments, 
            lineNumber, 
            originalLine: line 
        };
    }

    private checkUndefinedVariablesInCompiledLine(line: string, originalLineNumber: number, diagnostics: vscode.Diagnostic[], 
                                                 definitions: DefinitionCollector, macroContext?: {name: string, params: string[]}): void {
        if (CalcpadLinter.isEmptyCommentOrDirective(line)) {
            return;
        }

        // Handle assignments and function definitions - check their RHS expressions
        const trimmedLine = line.trim();
        
        // Check if it's a variable assignment: x = expression
        const assignmentMatch = CalcpadLinter.PATTERNS.variableAssignment.exec(trimmedLine);
        if (assignmentMatch) {
            const variableName = assignmentMatch[1];
            
            // Validate the left-hand side variable name for invalid $ usage
            if (variableName.endsWith('$') && !macroContext) {
                const varStartPos = trimmedLine.indexOf(variableName);
                const range = new vscode.Range(originalLineNumber, varStartPos, originalLineNumber, varStartPos + variableName.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Invalid use of '$' suffix in variable assignment: '${variableName}' is not a macro`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
            
            const equalSignPos = line.indexOf('=');
            if (equalSignPos !== -1) {
                // Only check the expression after the = sign
                const rhsLine = line.substring(equalSignPos + 1);
                const parsed = this.extractCodeAndStrings(rhsLine, originalLineNumber);
                
                // Adjust positions to account for the offset
                const adjustedSegments = parsed.codeSegments.map(segment => ({
                    ...segment,
                    startPos: segment.startPos + equalSignPos + 1
                }));
                
                for (const codeSegment of adjustedSegments) {
                    this.lintCodeSegmentForUndefinedVariables(codeSegment, diagnostics, definitions, macroContext);
                }
            }
            return;
        }

        // Check if it's a function definition: f(params) = expression
        const functionMatch = CalcpadLinter.PATTERNS.functionDefinition.exec(trimmedLine);
        if (functionMatch) {
            const equalSignPos = line.indexOf('=');
            if (equalSignPos !== -1) {
                // Extract parameters to exclude them from undefined variable checking
                const params = functionMatch[2].trim();
                const paramNames = new Set<string>();
                if (params) {
                    params.split(';').forEach(param => {
                        const paramName = param.trim();
                        if (paramName) {
                            paramNames.add(paramName);
                        }
                    });
                }
                
                // Check the expression after the = sign, but exclude function parameters
                const rhsLine = line.substring(equalSignPos + 1);
                const parsed = this.extractCodeAndStrings(rhsLine, originalLineNumber);
                
                // Adjust positions to account for the offset
                const adjustedSegments = parsed.codeSegments.map(segment => ({
                    ...segment,
                    startPos: segment.startPos + equalSignPos + 1
                }));
                
                for (const codeSegment of adjustedSegments) {
                    // For function parameters, create a mock macro context to exclude them
                    const functionContext = { name: 'function', params: Array.from(paramNames) };
                    this.lintCodeSegmentForUndefinedVariables(codeSegment, diagnostics, definitions, functionContext);
                }
            }
            return;
        }

        // Extract code and string segments
        const parsed = this.extractCodeAndStrings(line, originalLineNumber);
        
        // Only lint code segments for undefined variables
        for (const codeSegment of parsed.codeSegments) {
            this.lintCodeSegmentForUndefinedVariables(codeSegment, diagnostics, definitions, macroContext);
        }
        
        // TODO: Lint string segments with different rules (for next task)
        // for (const stringSegment of parsed.stringSegments) {
        //     this.lintStringSegment(stringSegment, diagnostics);
        // }
    }

    private lintCodeSegmentForUndefinedVariables(
        segment: {text: string, startPos: number, lineNumber: number}, 
        diagnostics: vscode.Diagnostic[], 
        definitions: DefinitionCollector,
        macroContext?: {name: string, params: string[]}
    ): void {
        if (CalcpadLinter.isEmptyCommentOrDirective(segment.text)) {
            return;
        }
        
        // Find variable/identifier references
        CalcpadLinter.PATTERNS.identifier.lastIndex = 0; // Reset regex state
        let match;
        while ((match = CalcpadLinter.PATTERNS.identifier.exec(segment.text)) !== null) {
            const identifier = match[1]; // Full identifier including $ if present
            const identifierPosInSegment = match.index;
            const actualPos = segment.startPos + identifierPosInSegment;
            
            // Debug: Log what was captured
            this.outputChannel.appendLine(`[DEBUG IDENTIFIER] Segment: "${segment.text}", Match: "${match[0]}", Group1: "${match[1]}", Final identifier: "${identifier}"`);
            
            // Skip if it's followed by parentheses (function call) - check in segment text
            const nextCharIndex = match.index + identifier.length;
            const nextChar = segment.text[nextCharIndex];
            if (nextChar === '(' || (nextChar === ' ' && segment.text[nextCharIndex + 1] === '(')) {
                continue; // This is handled by function validation
            }
            
            // Skip if it's a literal number or operator
            if (/^\d/.test(identifier) || this.operators.test(identifier)) {
                continue;
            }
            
            // Skip if this is a macro parameter (simplified approach - just check if it's in the parameter list)
            if (macroContext && macroContext.params.includes(identifier)) {
                this.outputChannel.appendLine(`[DEBUG] Skipping macro parameter: ${identifier} (from macro ${macroContext.name})`);
                continue;
            }
            
            // Use centralized identifier checking, but treat bare function names as undefined
            const identifierInfo = this.isKnownIdentifier(identifier, definitions);
            
            // If it's a built-in function but not followed by parentheses, treat as undefined variable
            const isBareFunction = identifierInfo.isKnown && identifierInfo.type === 'builtin';
            
            if (!identifierInfo.isKnown || isBareFunction) {
                // Handle special case for macros
                if (identifier.endsWith('$') && !definitions.getAllMacros().has(identifier)) {
                    const range = new vscode.Range(segment.lineNumber, actualPos, segment.lineNumber, actualPos + identifier.length);
                    const suggestions = this.getSuggestionsFromCollector(identifier, definitions);
                    let message = `Undefined macro '${identifier}'`;
                    if (suggestions.length > 0) {
                        message += `. Did you mean: ${suggestions.join(', ')}?`;
                    }
                    diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error));
                } else if (!identifier.endsWith('$')) {
                    const range = new vscode.Range(segment.lineNumber, actualPos, segment.lineNumber, actualPos + identifier.length);
                    const suggestions = this.getSuggestionsFromCollector(identifier, definitions);
                    let message = `Undefined variable '${identifier}'`;
                    if (suggestions.length > 0) {
                        message += `. Did you mean: ${suggestions.join(', ')}?`;
                    }
                    if (isBareFunction) {
                        message = `Function '${identifier}' used without parentheses. Did you mean '${identifier}()'?`;
                    }
                    diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error));
                }
            } else if (identifier.endsWith('$') && identifierInfo.isKnown && identifierInfo.type !== 'macro') {
                // Flag $ usage outside of macro context when it's not a macro or parameter
                if (!macroContext) {
                    const range = new vscode.Range(segment.lineNumber, actualPos, segment.lineNumber, actualPos + identifier.length);
                    diagnostics.push(new vscode.Diagnostic(
                        range, 
                        `Invalid use of '$' suffix: '${identifier}' is not a macro and is used outside macro context`,
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

    private checkParenthesesBalance(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkBracketBalance(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkVariableNaming(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkFunctionDefinition(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
        const trimmedLine = line.trim();
        
        // Check if it's a function definition
        const match = CalcpadLinter.PATTERNS.functionDefinition.exec(trimmedLine);
        if (match) {
            const funcName = match[1];
            const params = match[2].trim();
            
            // Functions must have at least one parameter
            if (params === '') {
                const openParenPos = line.indexOf('(');
                const closeParenPos = line.indexOf(')', openParenPos);
                const range = new vscode.Range(lineNumber, openParenPos, lineNumber, closeParenPos + 1);
                
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Function '${funcName}' must have at least one parameter`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }

    private checkFunctionUsage(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[], userDefinedFunctions: Map<string, number>): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
        // Only check function calls in code segments, not strings
        for (const codeSegment of parsedLine.codeSegments) {
            this.checkFunctionUsageInCodeSegment(codeSegment, diagnostics, userDefinedFunctions);
        }
    }

    private checkFunctionUsageInCodeSegment(
        segment: {text: string, startPos: number, lineNumber: number},
        diagnostics: vscode.Diagnostic[],
        userDefinedFunctions: Map<string, number>
    ): void {
        // Check for function calls with missing parentheses or incorrect syntax
        const functionCallPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
        let match;

        while ((match = functionCallPattern.exec(segment.text)) !== null) {
            const funcName = match[1];
            const paramsString = match[2].trim();

            const actualPos = segment.startPos + match.index;

            // Check if it's an unknown function (not built-in or user-defined)
            if (!this.builtInFunctions.has(funcName.toLowerCase()) && 
                !this.controlKeywords.has(funcName.toLowerCase()) && 
                !userDefinedFunctions.has(funcName)) {
                const range = new vscode.Range(segment.lineNumber, actualPos, segment.lineNumber, actualPos + funcName.length);
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
                    const range = new vscode.Range(segment.lineNumber, actualPos, segment.lineNumber, actualPos + match[0].length);
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
            const funcMatch = pattern.exec(segment.text);
            if (funcMatch) {
                const params = funcMatch[1];
                if (params.includes(',') && !params.includes(';')) {
                    const actualPos = segment.startPos + funcMatch.index;
                    const range = new vscode.Range(segment.lineNumber, actualPos, segment.lineNumber, actualPos + funcMatch[0].length);
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Function '${func}' parameters should be separated by semicolons, not commas`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        }
    }

    private checkCommandUsage(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkOperatorSyntax(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkControlStructures(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkKeywordValidation(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

    private checkAssignments(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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

        // Check for string assignments to variables
        this.checkStringAssignments(parsedLine, diagnostics);

        // Check assignment expressions for invalid bare identifiers
        this.checkAssignmentExpressions(parsedLine, diagnostics);
    }

    private checkStringAssignments(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
        
        // Skip lines that don't contain assignments, are macro definitions, or function definitions
        if (!line.includes('=') || line.trim().startsWith('#') || (line.includes('(') && line.includes(')'))) {
            return;
        }

        // Pattern to match variable assignments: variableName = expression
        const assignmentPattern = /([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$?)\s*=\s*(.+)/;
        const match = assignmentPattern.exec(line.trim());
        
        if (match) {
            const variableName = match[1];
            const expression = match[2].trim();
            
            // Allow string assignments to macros (variables ending with $)
            const isMacroAssignment = variableName.endsWith('$');
            
            // Check if the expression is a string literal (starts and ends with quotes)
            const isStringLiteral = (expression.startsWith('"') && expression.endsWith('"')) || 
                                   (expression.startsWith("'") && expression.endsWith("'"));
            
            // Only flag error if it's a string assigned to a regular variable (not a macro)
            if (isStringLiteral && !isMacroAssignment) {
                const varStartPos = line.indexOf(variableName);
                const equalPos = line.indexOf('=', varStartPos);
                const range = new vscode.Range(lineNumber, varStartPos, lineNumber, equalPos + expression.length + 1);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    'Strings cannot be assigned to variables. Use a macro (name$) instead',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
    }

    private checkAssignmentExpressions(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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


    private checkMacroSyntax(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (trimmedLine === '' || trimmedLine.startsWith('"') || trimmedLine.startsWith("'")) {
            return;
        }

        // Check for #def macro definitions
        if (trimmedLine.startsWith('#def ')) {
            this.checkMacroDefinition(parsedLine, diagnostics);
        }
    }

    private checkMacroDefinition(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
        const trimmedLine = line.trim();
        
        // Check for inline macro definition: #def name$ = content or #def name$(params) = content
        const inlineMacroPattern = /#def\s+([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$?(?:\([^)]*\))?)\s*=\s*(.+)/;
        const inlineMatch = inlineMacroPattern.exec(trimmedLine);
        
        if (inlineMatch) {
            const macroDeclaration = inlineMatch[1];
            
            // Check if it's a macro with parameters
            const macroWithParamsPattern = /^([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$?)\(([^)]*)\)$/;
            const paramMatch = macroWithParamsPattern.exec(macroDeclaration);
            
            if (paramMatch) {
                // Inline macro with parameters
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
                    const paramsStartInLine = line.indexOf('(') + 1;
                    let currentParamPos = paramsStartInLine;
                    
                    for (const param of paramList) {
                        if (param && !param.endsWith('$')) {
                            // Find the parameter position within the parameter list
                            const paramStartPos = line.indexOf(param, currentParamPos);
                            if (paramStartPos !== -1) {
                                const range = new vscode.Range(lineNumber, paramStartPos, lineNumber, paramStartPos + param.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `Macro parameter '${param}' should end with '$'`,
                                    vscode.DiagnosticSeverity.Warning
                                ));
                            }
                        }
                        // Move to the next parameter position (after current param + semicolon + spaces)
                        currentParamPos = line.indexOf(param, currentParamPos) + param.length + 1;
                    }
                }
            } else {
                // Simple inline macro without parameters
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
            return;
        }

        // Check for multiline macro definition: #def name$ or #def name$(param1$; param2$; ...)
        const multilineMacroPattern = /#def\s+([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$?(?:\([^)]*\))?)\s*$/;
        const multilineMatch = multilineMacroPattern.exec(trimmedLine);
        
        if (multilineMatch) {
            const macroDeclaration = multilineMatch[1];
            
            // Check if it's a macro with parameters
            const macroWithParamsPattern = /^([a-zA-Zα-ωΑ-Ω°øØ∡][a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]*\$?)\(([^)]*)\)$/;
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
                    const paramsStartInLine = line.indexOf('(') + 1;
                    let currentParamPos = paramsStartInLine;
                    
                    for (const param of paramList) {
                        if (param && !param.endsWith('$')) {
                            // Find the parameter position within the parameter list
                            const paramStartPos = line.indexOf(param, currentParamPos);
                            if (paramStartPos !== -1) {
                                const range = new vscode.Range(lineNumber, paramStartPos, lineNumber, paramStartPos + param.length);
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `Macro parameter '${param}' should end with '$'`,
                                    vscode.DiagnosticSeverity.Warning
                                ));
                            }
                        }
                        // Move to the next parameter position (after current param + semicolon + spaces)
                        currentParamPos = line.indexOf(param, currentParamPos) + param.length + 1;
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

    private checkUnits(parsedLine: ParsedLine, diagnostics: vscode.Diagnostic[]): void {
        const line = parsedLine.originalLine;
        const lineNumber = parsedLine.lineNumber;
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
        this.outputChannel.dispose();
    }
}