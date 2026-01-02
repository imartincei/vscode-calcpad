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
    None = 0,
    Const = 1,
    Units = 2,
    Operator = 3,
    Variable = 4,
    Function = 5,
    Keyword = 6,
    Command = 7,
    Bracket = 8,
    Comment = 9,
    Tag = 10,
    Input = 11,
    Include = 12,
    Macro = 13,
    HtmlComment = 14,
    Format = 15,
    LocalVariable = 16,       // Local variables scoped to expressions (function params, #for vars, command scope vars)
    FilePath = 17,            // File paths in data exchange keywords (#read, #write, #append)
    DataExchangeKeyword = 18  // Sub-keywords in data exchange statements (from, to, sep, type)
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
