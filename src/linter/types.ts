import * as vscode from 'vscode';

// Interface for centralized definition collection
export interface DefinitionCollector {
    getAllVariables(): Set<string>;
    getAllFunctions(): Map<string, number>;
    getAllMacros(): Map<string, number>;
    getAllCustomUnits(): Set<string>;
    getBuiltInFunctions(): Set<string>;
    getControlKeywords(): Set<string>;
    getCommands(): Set<string>;
    getValidHashKeywords(): Set<string>;
}

// Interface for parsed line segments
export interface ParsedLine {
    codeSegments: Array<{text: string, startPos: number, lineNumber: number}>;
    stringSegments: Array<{text: string, startPos: number, endPos: number, lineNumber: number}>;
    lineNumber: number;
    originalLine: string;
}

// Diagnostic with error code
export interface DiagnosticWithCode extends vscode.Diagnostic {
    code: string;
}

// Macro context for tracking parameters
export interface MacroContext {
    name: string;
    params: string[];
}
