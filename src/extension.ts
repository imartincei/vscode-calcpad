import * as vscode from 'vscode';
import axios from 'axios';
import { CalcpadLinter } from './calcpadLinter';

let activePreviewPanel: vscode.WebviewPanel | unknown = undefined;
let previewUpdateTimeout: NodeJS.Timeout | unknown = undefined;
let linter: CalcpadLinter;

async function updatePreviewContent(panel: vscode.WebviewPanel, content: string) {
    const config = vscode.workspace.getConfiguration('calcpad');
    const apiBaseUrl = config.get<string>('apiBaseUrl');
    if (!apiBaseUrl) {
        throw new Error('API base URL not configured');
    }

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CalcPad Preview</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                .loading { text-align: center; color: #666; }
            </style>
        </head>
        <body><div class="loading">Loading preview...</div></body>
        </html>
    `;

    try {
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert`, 
            { content },
            { headers: { 'Content-Type': 'application/json' } }
        );

        panel.webview.html = response.data;
        
    } catch (error) {
        panel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .error { color: #d32f2f; background: #ffebee; padding: 15px; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h3>Preview Error</h3>
                    <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                    <p>Server URL: ${apiBaseUrl}/api/calcpad/convert</p>
                </div>
            </body>
            </html>
        `;
    }
}

async function createHtmlPreview(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    if (activePreviewPanel) {
        (activePreviewPanel as vscode.WebviewPanel).reveal(vscode.ViewColumn.Beside);
        await updatePreviewContent(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText());
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'htmlPreview',
        'CalcPad Preview',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true
        }
    );

    activePreviewPanel = panel;
    
    panel.onDidDispose(() => {
        activePreviewPanel = undefined;
    });

    await updatePreviewContent(panel, activeEditor.document.getText());
}

function schedulePreviewUpdate() {
    if (!activePreviewPanel) return;
    
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;

    if (previewUpdateTimeout) {
        clearTimeout(previewUpdateTimeout as NodeJS.Timeout);
    }

    previewUpdateTimeout = setTimeout(async () => {
        if (activePreviewPanel && activeEditor) {
            await updatePreviewContent(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText());
        }
    }, 500);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('VS Code CalcPad extension is now active!');
    
    linter = new CalcpadLinter();

    const disposable = vscode.commands.registerCommand('vscode-calcpad.activate', () => {
        vscode.window.showInformationMessage('CalcPad activated!');
    });

    const previewCommand = vscode.commands.registerCommand('vscode-calcpad.previewHtml', () => {
        createHtmlPreview(context);
    });

    // Lint on document open
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(document => {
        if (document.languageId === 'calcpad' || document.languageId === 'plaintext') {
            linter.lintDocument(document);
        }
    });

    // Lint on document save
    const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => {
        if (document.languageId === 'calcpad' || document.languageId === 'plaintext') {
            linter.lintDocument(document);
        }
    });

    // Lint on document change (with debouncing)
    let lintTimeout: NodeJS.Timeout | unknown = undefined;
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'calcpad' || event.document.languageId === 'plaintext') {
            if (lintTimeout) {
                clearTimeout(lintTimeout as NodeJS.Timeout);
            }
            lintTimeout = setTimeout(() => {
                linter.lintDocument(event.document);
            }, 500);
        }
        schedulePreviewUpdate();
    });

    // Lint all open calcpad documents on activation
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'calcpad' || document.languageId === 'plaintext') {
            linter.lintDocument(document);
        }
    });

    context.subscriptions.push(disposable, previewCommand, linter, onDidChangeTextDocument, onDidOpenTextDocument, onDidSaveTextDocument);
}

export function deactivate() {
    if (linter) {
        linter.dispose();
    }
}