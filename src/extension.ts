import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CalcpadLinter } from './calcpadLinter';
import { CalcpadUIProvider } from './calcpadUIProvider';
import { CalcpadSettingsManager } from './calcpadSettings';

let activePreviewPanel: vscode.WebviewPanel | unknown = undefined;
let activePreviewType: 'regular' | 'unwrapped' | undefined = undefined;
let previewUpdateTimeout: NodeJS.Timeout | unknown = undefined;
let linter: CalcpadLinter;
let outputChannel: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext;

interface PdfSettings {
    // Header settings
    enableHeader: boolean;
    documentTitle: string;
    documentSubtitle: string;
    headerCenter: string;
    author: string;
    
    // Footer settings
    enableFooter: boolean;
    footerCenter: string;
    company: string;
    project: string;
    showPageNumbers: boolean;
    
    // Page settings
    format: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
    orientation: 'portrait' | 'landscape';
    marginTop: string;
    marginBottom: string;
    marginLeft: string;
    marginRight: string;
    
    // Content settings
    printBackground: boolean;
    scale: number;
    
    // Template settings
    headerTemplate: string;
    footerTemplate: string;
    
    // Background graphics
    backgroundSvgPath: string;
}


function getPdfSettings(): PdfSettings {
    const config = vscode.workspace.getConfiguration('calcpad');
    const activeEditor = vscode.window.activeTextEditor;
    
    const fileName = activeEditor 
        ? path.basename(activeEditor.document.fileName, path.extname(activeEditor.document.fileName))
        : 'CalcPad Document';
    
    return {
        // Header settings
        enableHeader: config.get<boolean>('pdf.enableHeader', true),
        documentTitle: config.get<string>('pdf.documentTitle') || fileName,
        documentSubtitle: config.get<string>('pdf.documentSubtitle', ''),
        headerCenter: config.get<string>('pdf.headerCenter', ''),
        author: config.get<string>('pdf.author', ''),
        
        // Footer settings
        enableFooter: config.get<boolean>('pdf.enableFooter', true),
        footerCenter: config.get<string>('pdf.footerCenter', ''),
        company: config.get<string>('pdf.company', ''),
        project: config.get<string>('pdf.project', ''),
        showPageNumbers: config.get<boolean>('pdf.showPageNumbers', true),
        
        // Page settings
        format: config.get<'A4' | 'A3' | 'A5' | 'Letter' | 'Legal'>('pdf.format', 'A4'),
        orientation: config.get<'portrait' | 'landscape'>('pdf.orientation', 'portrait'),
        marginTop: config.get<string>('pdf.marginTop', '2cm'),
        marginBottom: config.get<string>('pdf.marginBottom', '2cm'),
        marginLeft: config.get<string>('pdf.marginLeft', '1.5cm'),
        marginRight: config.get<string>('pdf.marginRight', '1.5cm'),
        
        // Content settings
        printBackground: config.get<boolean>('pdf.printBackground', true),
        scale: config.get<number>('pdf.scale', 1.0),
        
        // Template settings - handled server-side
        headerTemplate: config.get<string>('pdf.headerTemplate', 'default'),
        footerTemplate: config.get<string>('pdf.footerTemplate', 'default'),
        
        // Background graphics - handled server-side
        backgroundSvgPath: config.get<string>('pdf.backgroundSvgPath', '')
    };
}

function getEffectivePreviewTheme(): 'light' | 'dark' {
    const config = vscode.workspace.getConfiguration('calcpad');
    const previewTheme = config.get<string>('previewTheme', 'system');
    
    if (previewTheme === 'light') {
        return 'light';
    } else if (previewTheme === 'dark') {
        return 'dark';
    } else {
        // System - follow VS Code theme
        const colorTheme = vscode.window.activeColorTheme;
        return colorTheme.kind === vscode.ColorThemeKind.Dark || 
               colorTheme.kind === vscode.ColorThemeKind.HighContrast ? 'dark' : 'light';
    }
}

function getPreviewHtml(): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CalcPad Preview</title>
            <style>
                .loading { 
                    text-align: center; 
                    color: #666; 
                    padding: 40px;
                }
            </style>
        </head>
        <body>
            <div class="loading">Loading preview...</div>
            <script>
                const vscode = acquireVsCodeApi();
                
                // Listen for messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'updateContent':
                            document.body.innerHTML = message.content;
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
    
    const settingsManager = CalcpadSettingsManager.getInstance();
    const settings = settingsManager.getSettings();
    const apiBaseUrl = settings.server.url;
    if (!apiBaseUrl) {
        outputChannel.appendLine('ERROR: Server URL not configured');
        throw new Error('Server URL not configured');
    }
    outputChannel.appendLine(`Server URL: ${apiBaseUrl}`);

    // Update panel title with current file name
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = activeEditor.document.fileName.split('/').pop() || 'CalcPad';
        panel.title = `CalcPad Preview - ${fileName}`;
    }

    try {
        outputChannel.appendLine('Getting settings...');
        const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
        const settings = await settingsManager.getApiSettings();
        outputChannel.appendLine(`Settings retrieved: ${JSON.stringify(settings)}`);
        
        outputChannel.appendLine('Making API call...');
        const theme = getEffectivePreviewTheme();
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert`, 
            { 
                content,
                settings,
                theme
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        outputChannel.appendLine('API call successful');

        // Use the entire API response as the webview HTML
        const apiResponse = response.data;
        
        outputChannel.appendLine('Setting webview HTML directly...');
        outputChannel.appendLine(`API response length: ${apiResponse.length} characters`);
        
        panel.webview.html = apiResponse;
        
        outputChannel.appendLine('Webview HTML set directly from API response');
        
    } catch (error) {
        outputChannel.appendLine(`ERROR in updatePreviewContent: ${error instanceof Error ? error.message : 'Unknown error'}`);
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>CalcPad Preview Error</title>
            </head>
            <body>
                <div style="color: #d32f2f; background: #ffebee; padding: 15px; border-radius: 4px; margin: 20px;">
                    <h3>Preview Error</h3>
                    <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                    <p>Server URL: ${apiBaseUrl}/api/calcpad/convert</p>
                </div>
            </body>
            </html>
        `;
        
        panel.webview.html = errorHtml;
    }
}

async function updatePreviewContentUnwrapped(panel: vscode.WebviewPanel, content: string) {
    outputChannel.appendLine('Starting updatePreviewContentUnwrapped...');
    
    const settingsManager = CalcpadSettingsManager.getInstance();
    const settings = settingsManager.getSettings();
    const apiBaseUrl = settings.server.url;
    if (!apiBaseUrl) {
        outputChannel.appendLine('ERROR: Server URL not configured');
        throw new Error('Server URL not configured');
    }
    outputChannel.appendLine(`Server URL: ${apiBaseUrl}`);

    // Update panel title with current file name
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = activeEditor.document.fileName.split('/').pop() || 'CalcPad';
        panel.title = `CalcPad Preview Unwrapped - ${fileName}`;
    }

    try {
        outputChannel.appendLine('Getting settings...');
        const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
        const settings = await settingsManager.getApiSettings();
        outputChannel.appendLine(`Settings retrieved: ${JSON.stringify(settings)}`);
        
        outputChannel.appendLine('Making API call to convert-unwrapped...');
        const theme = getEffectivePreviewTheme();
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert-unwrapped`, 
            { 
                content,
                settings,
                theme
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        outputChannel.appendLine('API call successful');

        // Use the entire API response as the webview HTML
        const apiResponse = response.data;
        
        outputChannel.appendLine('Setting webview HTML directly...');
        outputChannel.appendLine(`API response length: ${apiResponse.length} characters`);
        
        panel.webview.html = apiResponse;
        
        outputChannel.appendLine('Webview HTML set directly from API response');
        
    } catch (error) {
        outputChannel.appendLine(`ERROR in updatePreviewContentUnwrapped: ${error instanceof Error ? error.message : 'Unknown error'}`);
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>CalcPad Preview Error</title>
            </head>
            <body>
                <div style="color: #d32f2f; background: #ffebee; padding: 15px; border-radius: 4px; margin: 20px;">
                    <h3>Preview Error (Unwrapped)</h3>
                    <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                    <p>Server URL: ${apiBaseUrl}/api/calcpad/convert-unwrapped</p>
                </div>
            </body>
            </html>
        `;
        
        panel.webview.html = errorHtml;
    }
}

async function generatePdf(panel: vscode.WebviewPanel, content: string) {
    const settingsManager = CalcpadSettingsManager.getInstance();
    const settings = settingsManager.getSettings();
    const apiBaseUrl = settings.server.url;
    if (!apiBaseUrl) {
        vscode.window.showErrorMessage('Server URL not configured');
        return;
    }

    try {
        const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
        const settings = await settingsManager.getApiSettings();
        
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

async function printToPdf() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active CalcPad document found');
        return;
    }

    try {
        // Get PDF settings
        const pdfSettings = getPdfSettings();
        
        // Get the active editor to determine the filename and directory
        let defaultPath: string;
        
        if (activeEditor && activeEditor.document.fileName !== 'Untitled-1') {
            // Use the same directory as the current file
            const currentDir = path.dirname(activeEditor.document.fileName);
            const baseFilename = path.basename(activeEditor.document.fileName, path.extname(activeEditor.document.fileName));
            defaultPath = path.join(currentDir, `${baseFilename}.pdf`);
        } else {
            // Use user's home directory as fallback
            const homeDir = os.homedir();
            defaultPath = path.join(homeDir, 'calcpad-preview.pdf');
        }
        
        outputChannel.appendLine(`Default save path: ${defaultPath}`);
        
        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultPath),
            filters: {
                'PDF Files': ['pdf']
            }
        });

        if (!saveUri) {
            return;
        }

        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating PDF...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Starting PDF generation..." });

            const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
            const calcpadSettings = settingsManager.getSettings();
            const apiBaseUrl = calcpadSettings.server.url;
            if (!apiBaseUrl) {
                throw new Error('Server URL not configured');
            }
            const settings = await settingsManager.getApiSettings();
            const documentContent = activeEditor.document.getText();
            
            if (!documentContent || documentContent.trim().length === 0) {
                throw new Error('Document is empty. Please add some CalcPad content first.');
            }

            progress.report({ increment: 20, message: "Calling PDF generation API..." });

            // Call the server's PDF generation API
            const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert-pdf`, 
                { 
                    content: documentContent,
                    settings,
                    pdfSettings: pdfSettings
                },
                { 
                    headers: { 'Content-Type': 'application/json' },
                    responseType: 'arraybuffer', // Important for binary PDF data
                    timeout: 60000 // PDF generation can take longer
                }
            );
            
            progress.report({ increment: 80, message: "Saving PDF file..." });
            
            // Write the PDF file
            await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(response.data));
            
            progress.report({ increment: 100, message: "PDF generation complete!" });
        });

        // Show success message with option to open
        const openChoice = await vscode.window.showInformationMessage(
            `PDF saved to ${saveUri.fsPath}`,
            'Open PDF'
        );
        
        if (openChoice === 'Open PDF') {
            vscode.env.openExternal(saveUri);
        }
        
    } catch (error) {
        outputChannel.appendLine(`ERROR in printToPdf: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    activePreviewType = 'regular';
    
    panel.onDidDispose(() => {
        activePreviewPanel = undefined;
        activePreviewType = undefined;
    });

    await updatePreviewContent(panel, activeEditor.document.getText());
}

async function createHtmlPreviewUnwrapped(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'htmlPreviewUnwrapped',
        'CalcPad Preview Unwrapped',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true
        }
    );

    // Update global references for unwrapped preview
    activePreviewPanel = panel;
    activePreviewType = 'unwrapped';
    
    panel.onDidDispose(() => {
        activePreviewPanel = undefined;
        activePreviewType = undefined;
    });

    await updatePreviewContentUnwrapped(panel, activeEditor.document.getText());
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
    
    // Store extension context for global access
    extensionContext = context;
    
    // Create output channel for debugging
    outputChannel = vscode.window.createOutputChannel('CalcPad');
    outputChannel.appendLine('CalcPad extension activated');
    
    linter = new CalcpadLinter();

    // Register webview provider for CalcPad UI panel
    const uiProvider = new CalcpadUIProvider(context.extensionUri, context);
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

    const previewUnwrappedCommand = vscode.commands.registerCommand('vscode-calcpad.previewUnwrapped', () => {
        createHtmlPreviewUnwrapped(context);
    });

    const showInsertCommand = vscode.commands.registerCommand('vscode-calcpad.showInsert', () => {
        vscode.commands.executeCommand('workbench.view.extension.calcpad-ui');
    });


    const printToPdfCommand = vscode.commands.registerCommand('vscode-calcpad.printToPdf', () => {
        printToPdf();
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
        previewUnwrappedCommand,
        showInsertCommand,
        printToPdfCommand,
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