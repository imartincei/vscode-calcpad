// Calcpad Server API Types
// Based on API_SCHEMA.md

// ============================================
// Client File Cache Types
// ============================================

// Simple dictionary mapping filename -> base64-encoded content
export type ClientFileCache = Record<string, string>;

// ============================================
// Lint API Types
// ============================================

export interface LintRequest {
    content: string;
    includeFiles?: Record<string, string>;
    clientFileCache?: ClientFileCache;
}

export interface LintResponse {
    errorCount: number;
    warningCount: number;
    diagnostics: LintDiagnostic[];
}

export interface LintDiagnostic {
    line: number;        // Zero-based line number
    column: number;      // Zero-based column (start position)
    endColumn: number;   // Zero-based end column position
    code: string;        // Error code (e.g., "CPD-3301")
    message: string;     // Human-readable error/warning message
    severity: string;    // Severity name: "error" or "warning"
    severityId: number;  // Severity ID: 0=Error, 1=Warning
    source: string;      // Source of the diagnostic (default: "Calcpad Linter")
}

// ============================================
// Highlight API Types
// ============================================

export interface HighlightRequest {
    content: string;
    includeText?: boolean;
}

export interface HighlightResponse {
    tokens: HighlightToken[];
}

export interface HighlightToken {
    line: number;      // Zero-based line number
    column: number;    // Zero-based column (character offset from start of line)
    length: number;    // Length of the token in characters
    type: string;      // Token type name for display/debugging
    typeId: number;    // Token type ID for efficient processing
    text?: string;     // Actual token text (only if includeText is true)
}

// ============================================
// Token Type Enum
// ============================================

export enum CalcpadTokenType {
    // ===== Core Syntax =====

    /** Whitespace or unknown content */
    None = 0,

    /** Numeric constants (e.g., 123, 3.14, 1e-5) */
    Const = 1,

    /** Operators (e.g., +, -, *, /, =, ≤, ≥) */
    Operator = 2,

    /** Brackets: (), [], {} */
    Bracket = 3,

    /** Line continuation marker (underscore _ at end of line) */
    LineContinuation = 4,

    // ===== Identifiers =====

    /** Variable identifiers */
    Variable = 5,

    /** Local variables scoped to a single expression or command block (function params, #for vars, command scope vars) */
    LocalVariable = 6,

    /** Function names (built-in or user-defined) */
    Function = 7,

    /** Macro names (ending with $) */
    Macro = 8,

    /** Macro parameters in #def statements (e.g., param1$, param2$ in #def macro$(param1$; param2$)) */
    MacroParameter = 9,

    /** Unit identifiers (e.g., m, kg, N/m²) */
    Units = 10,

    /** Special setting variables (PlotHeight, PlotWidth, PlotSVG, Precision, Tol, etc.) */
    Setting = 11,

    // ===== Keywords and Commands =====

    /** Keywords starting with # (e.g., #if, #else, #def) */
    Keyword = 12,

    /** Control block keywords (#if, #repeat, #for, #while, #def, #else, #else if, #break, #continue) */
    ControlBlockKeyword = 13,

    /** End keywords that close control blocks (#end if, #end def, #loop) */
    EndKeyword = 14,

    /** Commands starting with $ (e.g., $plot, $find, $sum) */
    Command = 15,

    // ===== File and Data Exchange =====

    /** Include file paths */
    Include = 16,

    /** File paths in data exchange keywords (#read, #write, #append) */
    FilePath = 17,

    /** Sub-keywords in data exchange statements (from, to, sep, type) */
    DataExchangeKeyword = 18,

    // ===== Comments and Documentation =====

    /** Plain text comments enclosed in ' or " without HTML content */
    Comment = 19,

    /** HTML comments (<!-- ... -->) */
    HtmlComment = 20,

    /** HTML tags within comments */
    Tag = 21,

    /** HTML content (text between HTML tags) */
    HtmlContent = 22,

    /** JavaScript code within script tags in comments */
    JavaScript = 23,

    /** CSS code within style tags in comments */
    Css = 24,

    /** SVG markup within svg tags in comments */
    Svg = 25,

    // ===== Special =====

    /** Input markers (? or #{...}) */
    Input = 26,

    /** Format specifiers (e.g., :f2, :e3) */
    Format = 27
}

// ============================================
// Definitions API Types
// ============================================

export interface DefinitionsRequest {
    content: string;
    includeFiles?: Record<string, string>;
    clientFileCache?: ClientFileCache;
}

export interface DefinitionsResponse {
    macros: MacroDefinition[];
    functions: FunctionDefinition[];
    variables: VariableDefinition[];
    customUnits: CustomUnitDefinition[];
}

export interface MacroDefinition {
    name: string;
    parameters: string[];
    isMultiline: boolean;
    content: string[];
    lineNumber: number;  // Zero-based line number
    source: string;
    sourceFile?: string;
}

export interface FunctionDefinition {
    name: string;
    parameters: string[];
    expression?: string;
    returnType: string;
    returnTypeId: number;
    hasCommandBlock: boolean;
    commandBlockType?: string;
    commandBlockStatements?: string[];
    lineNumber: number;  // Zero-based line number
    source: string;
    sourceFile?: string;
}

export interface VariableDefinition {
    name: string;
    expression?: string;
    type: string;
    typeId: number;
    lineNumber: number;  // Zero-based line number
    source: string;
    sourceFile?: string;
}

export interface CustomUnitDefinition {
    name: string;
    expression?: string;
    lineNumber: number;  // Zero-based line number
    source: string;
    sourceFile?: string;
}

// Type IDs for variables and function return types
export enum CalcpadTypeId {
    Unknown = 0,
    Value = 1,
    Vector = 2,
    Matrix = 3,
    StringVariable = 4,
    Various = 5,
    Function = 6,
    InlineMacro = 7,
    MultilineMacro = 8,
    CustomUnit = 9
}
