import * as monaco from 'monaco-editor';
import { CalcpadApiClient } from 'calcpad-frontend/api/client';
import type { LintDiagnostic } from 'calcpad-frontend/types/api';

/**
 * Set up diagnostics: lint on content change (debounced), show markers in Monaco.
 * Returns a disposable to clean up the listener.
 */
export function setupDiagnostics(
    editor: monaco.editor.IStandaloneCodeEditor,
    apiClient: CalcpadApiClient
): monaco.IDisposable {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const listener = editor.onDidChangeModelContent(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => lintAndMark(editor, apiClient), 500);
    });

    // Initial lint
    setTimeout(() => lintAndMark(editor, apiClient), 300);

    return listener;
}

async function lintAndMark(
    editor: monaco.editor.IStandaloneCodeEditor,
    apiClient: CalcpadApiClient
): Promise<void> {
    const model = editor.getModel();
    if (!model) return;

    const content = model.getValue();
    const response = await apiClient.lint(content);

    if (!response?.diagnostics) {
        monaco.editor.setModelMarkers(model, 'calcpad', []);
        return;
    }

    const markers: monaco.editor.IMarkerData[] = response.diagnostics.map(
        (diag: LintDiagnostic) => ({
            severity: mapSeverity(diag.severityId),
            message: diag.message,
            startLineNumber: diag.line + 1,        // Server is 0-based, Monaco is 1-based
            startColumn: diag.column + 1,
            endLineNumber: diag.line + 1,           // LintDiagnostic is single-line
            endColumn: diag.endColumn + 1,
        })
    );

    monaco.editor.setModelMarkers(model, 'calcpad', markers);
}

function mapSeverity(severityId: number): monaco.MarkerSeverity {
    switch (severityId) {
        case 0: return monaco.MarkerSeverity.Error;       // severityId 0 = Error
        case 1: return monaco.MarkerSeverity.Warning;     // severityId 1 = Warning
        default: return monaco.MarkerSeverity.Info;
    }
}
