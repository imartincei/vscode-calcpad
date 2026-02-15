// =============================================================================
// calcpad-frontend — Shared CalcPad frontend logic
// =============================================================================

// --- Types -------------------------------------------------------------------
export type {
    ClientFileCache,
    LintRequest,
    LintResponse,
    LintDiagnostic,
    HighlightRequest,
    HighlightResponse,
    HighlightToken,
    DefinitionsRequest,
    DefinitionsResponse,
    MacroDefinition,
    FunctionDefinition,
    VariableDefinition,
    CustomUnitDefinition,
} from './types/api';
export { CalcpadTokenType, CalcpadTypeId } from './types/api';

export type { ILogger, IFileSystem } from './types/interfaces';

export type { CalcpadSettings } from './types/settings';
export {
    getDefaultSettings,
    colorScaleToEnum,
    lightDirectionToEnum,
    buildApiSettings,
} from './types/settings';

export type {
    SnippetParameterDto,
    SnippetDto,
    SnippetsResponse,
    InsertItem,
    InsertDataTree,
    SnippetsLoadedCallback,
} from './types/snippets';

// --- API Client --------------------------------------------------------------
export { CalcpadApiClient } from './api/client';

// --- Services ----------------------------------------------------------------
export { CalcpadServerManager } from './services/server-manager';
export { CalcpadLintService } from './services/linter';
export { CalcpadDefinitionsService } from './services/definitions';
export { CalcpadSnippetService } from './services/snippets';
export {
    SEMANTIC_TOKEN_TYPES,
    TOKEN_TYPE_MAP,
    mapTokenTypeToIndex,
} from './services/highlight';
export {
    expandEnvironmentVariables,
    isAbsolutePath,
    stripLocalBlocks,
    parseIncludeDirective,
    parseReadDirective,
    extractReferencedFilenames,
    extractReferencedFilenamesFromGlobalScope,
    buildClientFileCache,
    buildClientFileCacheFromContent,
} from './services/file-cache';

// --- Text Analysis -----------------------------------------------------------
export {
    OPERATOR_REPLACEMENTS,
    isOperatorTriggerChar,
    isInsideStringOrComment,
    findOperatorReplacement,
} from './text/operators';
export {
    QUICK_TYPE_MAP,
    findQuickTypeReplacement,
} from './text/quick-type';
export {
    INDENT_INCREASE_PATTERNS,
    INDENT_DECREASE_PATTERNS,
    shouldIncreaseIndent,
    shouldDecreaseIndent,
    getIndentation,
    couldCompleteDedentKeyword,
    calculateExpectedIndent,
} from './text/auto-indent';
