import * as vscode from 'vscode';
import axios from 'axios';
import { CalcpadLinter } from './calcpadLinter';
import { CalcpadUIProvider } from './calcpadUIProvider';
import { CalcpadSettingsManager } from './calcpadSettings';

let activePreviewPanel: vscode.WebviewPanel | unknown = undefined;
let previewUpdateTimeout: NodeJS.Timeout | unknown = undefined;
let linter: CalcpadLinter;
let outputChannel: vscode.OutputChannel;

function getPreviewHtml(): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CalcPad Preview</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    padding: 0; 
                    margin: 0; 
                    line-height: 1.6; 
                }
                .preview-header {
                    position: sticky;
                    top: 0;
                    background: #f8f9fa;
                    border-bottom: 1px solid #dee2e6;
                    padding: 8px 16px;
                    z-index: 1000;
                }
                .preview-title {
                    font-size: 14px;
                    font-weight: bold;
                    color: #495057;
                }
                .preview-content {
                    padding: 20px;
                }
                .loading { 
                    text-align: center; 
                    color: #666; 
                    padding: 40px;
                }
            </style>
        </head>
        <body>
            <div class="preview-header">
                <div class="preview-title">CalcPad Preview</div>
            </div>
            <div class="preview-content">
                <div class="loading">Loading preview...</div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                // Listen for messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'updateContent':
                            const contentDiv = document.querySelector('.preview-content');
                            if (contentDiv) {
                                contentDiv.innerHTML = message.content;
                            }
                            break;
                    }
                });
            </script>
        </body>
        </html>
    `;
}

async function updatePreviewContent(panel: vscode.WebviewPanel, content: string) {
    outputChannel.appendLine('Starting updatePreviewContent...');
    
    const config = vscode.workspace.getConfiguration('calcpad');
    const apiBaseUrl = config.get<string>('apiBaseUrl');
    if (!apiBaseUrl) {
        outputChannel.appendLine('ERROR: API base URL not configured');
        throw new Error('API base URL not configured');
    }
    outputChannel.appendLine(`API base URL: ${apiBaseUrl}`);

    // Update panel title with current file name
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = activeEditor.document.fileName.split('/').pop() || 'CalcPad';
        panel.title = `CalcPad Preview - ${fileName}`;
    }

    try {
        outputChannel.appendLine('Getting settings...');
        const settingsManager = CalcpadSettingsManager.getInstance();
        const settings = settingsManager.getApiSettings();
        outputChannel.appendLine(`Settings retrieved: ${JSON.stringify(settings)}`);
        
        outputChannel.appendLine('Making API call...');
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert`, 
            { 
                content,
                settings 
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        outputChannel.appendLine('API call successful');

        // Extract body content from the API response and inject it into our template
        const apiResponse = response.data;
        const bodyMatch = apiResponse.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : apiResponse;
        
        // Update just the preview content area
        outputChannel.appendLine('Sending content update message...');
        outputChannel.appendLine(`Message content length: ${bodyContent.length} characters`);
        
        const messageResult = panel.webview.postMessage({
            type: 'updateContent',
            content: bodyContent
        });
        
        outputChannel.appendLine(`Post message result: ${messageResult}`);
        outputChannel.appendLine('Content update message sent');
        
        // Add a small delay to check if the webview processes the message
        setTimeout(() => {
            outputChannel.appendLine('Checking webview state after message...');
        }, 1000);
        
    } catch (error) {
        outputChannel.appendLine(`ERROR in updatePreviewContent: ${error instanceof Error ? error.message : 'Unknown error'}`);
        const errorContent = `
            <div style="color: #d32f2f; background: #ffebee; padding: 15px; border-radius: 4px; margin: 20px;">
                <h3>Preview Error</h3>
                <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                <p>Server URL: ${apiBaseUrl}/api/calcpad/convert</p>
            </div>
        `;
        
        panel.webview.postMessage({
            type: 'updateContent',
            content: errorContent
        });
    }
}

async function generatePdf(panel: vscode.WebviewPanel, content: string) {
    const config = vscode.workspace.getConfiguration('calcpad');
    const apiBaseUrl = config.get<string>('apiBaseUrl');
    if (!apiBaseUrl) {
        vscode.window.showErrorMessage('API base URL not configured');
        return;
    }

    try {
        const settingsManager = CalcpadSettingsManager.getInstance();
        const settings = settingsManager.getApiSettings();
        
        // Override the output format to PDF
        const baseSettings = settings as Record<string, unknown>;
        const outputSettings = (baseSettings.output as Record<string, unknown>) || {};
        
        const pdfSettings = {
            ...baseSettings,
            output: {
                ...outputSettings,
                format: 'pdf',
                silent: false // Don't use silent mode for PDF generation
            }
        };
        
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert`, 
            { 
                content,
                settings: pdfSettings
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                responseType: 'arraybuffer' // Important for binary PDF data
            }
        );

        // Get the active editor to determine the filename
        const activeEditor = vscode.window.activeTextEditor;
        const baseFilename = activeEditor 
            ? activeEditor.document.fileName.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'calcpad'
            : 'calcpad';
        
        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${baseFilename}.pdf`),
            filters: {
                'PDF Files': ['pdf']
            }
        });

        if (saveUri) {
            // Write the PDF file
            await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(response.data));

            // Show success message with option to open
            const openChoice = await vscode.window.showInformationMessage(
                `PDF saved to ${saveUri.fsPath}`,
                'Open PDF'
            );
            
            if (openChoice === 'Open PDF') {
                vscode.env.openExternal(saveUri);
            }
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(
            `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
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
    
    // Set the HTML once at the beginning
    panel.webview.html = getPreviewHtml();
    
    panel.onDidDispose(() => {
        activePreviewPanel = undefined;
    });

    // Handle messages from the webview (now minimal)
    panel.webview.onDidReceiveMessage(
        message => {
            // No longer need to handle refresh/printToPdf messages
            // since buttons are now in the editor title bar
        },
        undefined
    );

    await updatePreviewContent(panel, activeEditor.document.getText());
}

function schedulePreviewUpdate() {
    if (!activePreviewPanel) return;
    
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    
    // Only update for .cpd files or plaintext files
    if (activeEditor.document.languageId !== 'calcpad' && activeEditor.document.languageId !== 'plaintext') {
        return;
    }

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
    
    // Create output channel for debugging
    outputChannel = vscode.window.createOutputChannel('CalcPad');
    outputChannel.appendLine('CalcPad extension activated');
    
    linter = new CalcpadLinter();

    // Register webview provider for CalcPad UI panel
    const uiProvider = new CalcpadUIProvider(context.extensionUri);
    const uiProviderDisposable = vscode.window.registerWebviewViewProvider(
        CalcpadUIProvider.viewType, 
        uiProvider
    );

    const disposable = vscode.commands.registerCommand('vscode-calcpad.activate', () => {
        vscode.window.showInformationMessage('CalcPad activated!');
    });

    const previewCommand = vscode.commands.registerCommand('vscode-calcpad.previewHtml', () => {
        createHtmlPreview(context);
    });

    const showInsertCommand = vscode.commands.registerCommand('vscode-calcpad.showInsert', () => {
        vscode.commands.executeCommand('workbench.view.extension.calcpad-ui');
    });

    const refreshPreviewCommand = vscode.commands.registerCommand('vscode-calcpad.refreshPreview', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activePreviewPanel) {
            updatePreviewContent(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText());
        }
    });

    const exportToPdfCommand = vscode.commands.registerCommand('vscode-calcpad.exportToPdf', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activePreviewPanel) {
            generatePdf(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText());
        } else if (activeEditor) {
            // Create a temporary panel just for PDF generation
            const tempPanel = vscode.window.createWebviewPanel(
                'tempPdfPanel',
                'PDF Export',
                vscode.ViewColumn.Active,
                { enableScripts: false }
            );
            generatePdf(tempPanel, activeEditor.document.getText());
            tempPanel.dispose();
        }
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

    // Update preview when active editor changes
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && activePreviewPanel && 
            (editor.document.languageId === 'calcpad' || editor.document.languageId === 'plaintext')) {
            schedulePreviewUpdate();
        }
    });

    // Lint all open calcpad documents on activation
    vscode.workspace.textDocuments.forEach(document => {
        if (document.languageId === 'calcpad' || document.languageId === 'plaintext') {
            linter.lintDocument(document);
        }
    });

    context.subscriptions.push(
        disposable, 
        previewCommand, 
        showInsertCommand,
        refreshPreviewCommand,
        exportToPdfCommand,
        uiProviderDisposable,
        linter, 
        outputChannel,
        onDidChangeTextDocument, 
        onDidOpenTextDocument, 
        onDidSaveTextDocument,
        onDidChangeActiveTextEditor
    );
}

export function deactivate() {
    if (linter) {
        linter.dispose();
    }
}