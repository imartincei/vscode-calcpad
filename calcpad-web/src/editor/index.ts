// =============================================================================
// Monaco editor integration for CalcPad
// Consolidated from the former calcpad-monaco package.
// =============================================================================

export { calcpadLanguage, calcpadLanguageConfiguration } from './language';
export { calcpadDarkTheme } from './theme';
export {
    registerCalcpadLanguage,
    registerCalcpadTheme,
    createCalcpadEditor,
} from './setup';
export type { CalcpadEditorOptions } from './setup';
export { registerSemanticTokensProvider } from './semantic-tokens';
export { setupDiagnostics } from './diagnostics';
export { registerCompletionProvider } from './completions';
