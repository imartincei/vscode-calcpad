import * as monaco from 'monaco-editor';

/**
 * CalcPad dark theme for Monaco, derived from themes/calcpad-dark-theme.json.
 * Maps semantic token types to colors matching the VS Code extension theme.
 */
export const calcpadDarkTheme: monaco.editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
        // Core syntax
        { token: 'comment', foreground: '57A64A' },
        { token: 'keyword', foreground: 'FF80FF' },
        { token: 'number', foreground: 'D4D4D4' },
        { token: 'operator', foreground: 'ECC860' },
        { token: 'bracket', foreground: 'FF69B4' },
        { token: 'identifier', foreground: 'D4D4D4' },

        // Semantic token rules (matched by semantic tokens provider)
        { token: 'const', foreground: 'D4D4D4' },
        { token: 'lineContinuation', foreground: 'ECC860' },
        { token: 'variable', foreground: '6B9FFF' },
        { token: 'localVariable', foreground: '8BB4FF' },
        { token: 'function', foreground: 'D4D4D4', fontStyle: 'bold' },
        { token: 'macro', foreground: 'D355D3' },
        { token: 'macroParameter', foreground: 'E07BE0' },
        { token: 'units', foreground: '00CED1' },
        { token: 'setting', foreground: '4FC1FF' },
        { token: 'controlBlockKeyword', foreground: 'FF80FF' },
        { token: 'endKeyword', foreground: 'FF80FF' },
        { token: 'command', foreground: 'FF80FF' },
        { token: 'include', foreground: '9B6BCC' },
        { token: 'filePath', foreground: '9B6BCC' },
        { token: 'dataExchangeKeyword', foreground: 'FF80FF' },
        { token: 'htmlComment', foreground: 'A0A0A0' },
        { token: 'tag', foreground: 'CC66FF' },
        { token: 'htmlContent', foreground: '57A64A' },
        { token: 'javascript', foreground: 'ECC860' },
        { token: 'css', foreground: '6B9FFF' },
        { token: 'svg', foreground: '00CED1' },
        { token: 'input', foreground: 'FF5555' },
        { token: 'format', foreground: 'A9A9A9' },
    ],
    colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorBracketMatch.background': '#0064001a',
        'editorBracketMatch.border': '#888888',
    },
};
