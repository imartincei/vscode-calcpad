import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CalcpadLinter } from './calcpadLinter';
import { CalcpadVueUIProvider } from './calcpadVueUIProvider';
import { CalcpadSettingsManager } from './calcpadSettings';
import { OperatorReplacer } from './operatorReplacer';
import { CalcpadCompletionProvider } from './calcpadCompletionProvider';
import { CalcpadInsertManager } from './calcpadInsertManager';

let activePreviewPanel: vscode.WebviewPanel | unknown = undefined;
let activePreviewType: 'regular' | 'unwrapped' | undefined = undefined;
let previewUpdateTimeout: NodeJS.Timeout | unknown = undefined;
let previewSourceEditor: vscode.TextEditor | undefined = undefined;
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
        const calcpadSettings = settingsManager.getSettings();
        const apiBaseUrl = calcpadSettings.server.url;
        
        if (!apiBaseUrl) {
            outputChannel.appendLine('ERROR: Server URL not configured');
            throw new Error('Server URL not configured');
        }
        outputChannel.appendLine(`Server URL: ${apiBaseUrl}`);
        outputChannel.appendLine(`Settings retrieved: ${JSON.stringify(settings)}`);
        
        outputChannel.appendLine('Making API call...');
        const theme = getEffectivePreviewTheme();
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert`,
            {
                content: content,
                settings: settings,
                theme: theme,
                forceUnwrappedCode: false
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

        // Inject JavaScript for error link navigation
        const errorNavigationScript = `
            <script>
                // VS Code webview API
                const vscode = acquireVsCodeApi();

                // Handle error link clicks
                document.addEventListener('DOMContentLoaded', function() {
                    // Find all error links with data-text attributes
                    const errorLinks = document.querySelectorAll('span.err a[data-text]');

                    errorLinks.forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            const lineNumber = this.getAttribute('data-text');
                            if (lineNumber) {
                                // Send message to VS Code to navigate to line
                                vscode.postMessage({
                                    type: 'navigateToLine',
                                    line: parseInt(lineNumber, 10)
                                });
                            }
                        });
                    });
                });
            </script>
        `;

        // Inject the script before closing body tag
        const htmlWithScript = apiResponse.replace('</body>', errorNavigationScript + '</body>');

        panel.webview.html = htmlWithScript;
        
        outputChannel.appendLine('Webview HTML set directly from API response');
        
    } catch (error) {
        outputChannel.appendLine(`ERROR in updatePreviewContent: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (axios.isAxiosError(error) && error.response) {
            outputChannel.appendLine(`Response status: ${error.response.status}`);
            outputChannel.appendLine(`Response data: ${JSON.stringify(error.response.data)}`);
        }
        const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
        const calcpadSettings = settingsManager.getSettings();
        const errorApiBaseUrl = calcpadSettings.server.url;
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
                    <p>Server URL: ${errorApiBaseUrl}/api/calcpad/convert</p>
                </div>
            </body>
            </html>
        `;
        
        panel.webview.html = errorHtml;
    }
}

async function updatePreviewContentUnwrapped(panel: vscode.WebviewPanel, content: string) {
    outputChannel.appendLine('Starting updatePreviewContentUnwrapped...');
    
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
        const calcpadSettings = settingsManager.getSettings();
        const apiBaseUrl = calcpadSettings.server.url;
        
        if (!apiBaseUrl) {
            outputChannel.appendLine('ERROR: Server URL not configured');
            throw new Error('Server URL not configured');
        }
        outputChannel.appendLine(`Server URL: ${apiBaseUrl}`);
        outputChannel.appendLine(`Settings retrieved: ${JSON.stringify(settings)}`);
        
        outputChannel.appendLine('Making API call to convert-unwrapped...');
        const theme = getEffectivePreviewTheme();
        const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert-unwrapped`,
            {
                content: content,
                settings: settings,
                theme: theme,
                forceUnwrappedCode: true
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

        // Inject JavaScript for error link navigation
        const errorNavigationScript = `
            <script>
                // VS Code webview API
                const vscode = acquireVsCodeApi();

                // Handle error link clicks
                document.addEventListener('DOMContentLoaded', function() {
                    // Find all error links with data-text attributes
                    const errorLinks = document.querySelectorAll('span.err a[data-text]');

                    errorLinks.forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            const lineNumber = this.getAttribute('data-text');
                            if (lineNumber) {
                                // Send message to VS Code to navigate to line
                                vscode.postMessage({
                                    type: 'navigateToLine',
                                    line: parseInt(lineNumber, 10)
                                });
                            }
                        });
                    });
                });
            </script>
        `;

        // Inject the script before closing body tag
        const htmlWithScript = apiResponse.replace('</body>', errorNavigationScript + '</body>');

        panel.webview.html = htmlWithScript;
        
        outputChannel.appendLine('Webview HTML set directly from API response');
        
    } catch (error) {
        outputChannel.appendLine(`ERROR in updatePreviewContentUnwrapped: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (axios.isAxiosError(error) && error.response) {
            outputChannel.appendLine(`Response status: ${error.response.status}`);
            outputChannel.appendLine(`Response data: ${JSON.stringify(error.response.data)}`);
        }
        const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
        const calcpadSettings = settingsManager.getSettings();
        const errorApiBaseUrl = calcpadSettings.server.url;
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
                    <p>Server URL: ${errorApiBaseUrl}/api/calcpad/convert-unwrapped</p>
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

        // Add hardcoded output format for PDF
        const pdfSettings = {
            ...(settings as Record<string, unknown>),
            output: {
                format: 'pdf',
                silent: false
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

        try {
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

                // Add hardcoded output format for PDF and merge with PDF-specific settings
                const settingsWithPdf = {
                    ...(settings as Record<string, unknown>),
                    output: {
                        format: 'pdf',
                        silent: false
                    }
                };

                // Call the server's PDF generation API
                const response = await axios.post(`${apiBaseUrl}/api/calcpad/convert`,
                    {
                        content: documentContent,
                        settings: settingsWithPdf,
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
            if (axios.isAxiosError(error) && error.response) {
                outputChannel.appendLine(`Response status: ${error.response.status}`);
                outputChannel.appendLine(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            vscode.window.showErrorMessage(
                `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }

    } catch (error) {
        outputChannel.appendLine(`ERROR in printToPdf (outer): ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Store the source editor for navigation
    previewSourceEditor = activeEditor;

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
        previewSourceEditor = undefined;
    });

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.type) {
                case 'navigateToLine':
                    const sourceEditor = previewSourceEditor;
                    if (sourceEditor && message.line) {
                        const line = Math.max(0, message.line - 1); // Convert to 0-based index
                        const position = new vscode.Position(line, 0);
                        const selection = new vscode.Selection(position, position);
                        sourceEditor.selection = selection;
                        sourceEditor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
                        vscode.window.showTextDocument(sourceEditor.document, vscode.ViewColumn.One);
                    }
                    break;
                default:
                    break;
            }
        }
    );

    await updatePreviewContent(panel, activeEditor.document.getText());
}

async function createHtmlPreviewUnwrapped(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    // Store the source editor for navigation
    previewSourceEditor = activeEditor;

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
        previewSourceEditor = undefined;
    });

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.type) {
                case 'navigateToLine':
                    const sourceEditor = previewSourceEditor;
                    if (sourceEditor && message.line) {
                        const line = Math.max(0, message.line - 1); // Convert to 0-based index
                        const position = new vscode.Position(line, 0);
                        const selection = new vscode.Selection(position, position);
                        sourceEditor.selection = selection;
                        sourceEditor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
                        vscode.window.showTextDocument(sourceEditor.document, vscode.ViewColumn.One);
                    }
                    break;
                default:
                    break;
            }
        }
    );

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
    
    try {
        // Store extension context for global access
        extensionContext = context;
        
        // Create output channel for debugging
        outputChannel = vscode.window.createOutputChannel('CalcPad Extension');
        outputChannel.appendLine('CalcPad extension activated');
        
        outputChannel.appendLine('Initializing settings manager...');
        const settingsManager = CalcpadSettingsManager.getInstance(context);
        
        outputChannel.appendLine('Initializing linter...');
        linter = new CalcpadLinter(settingsManager);

        // Initialize operator replacer
        outputChannel.appendLine('Initializing operator replacer...');
        const operatorReplacer = new OperatorReplacer(outputChannel);
        const operatorReplacerDisposable = operatorReplacer.registerDocumentChangeListener(context);

        // Initialize autocomplete provider
        outputChannel.appendLine('Initializing autocomplete provider...');
        const completionProviderDisposable = CalcpadCompletionProvider.register(settingsManager, outputChannel);

    // Unified document processing function
    async function processDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'calcpad' && document.languageId !== 'plaintext') {
            return;
        }

        outputChannel.appendLine(`[processDocument] Processing document: ${document.uri.fsPath}`);

        // Run linting
        await linter.lintDocument(document);

        // Extract macros and send to UI
        try {
            const contentResolver = linter.getContentResolver();
            const text = document.getText();
            const lines = text.split('\n');
            
            await contentResolver.preCacheContent(lines);
            const resolvedContent = contentResolver.getCompiledContent(document);
            
            outputChannel.appendLine(`[processDocument] Found ${resolvedContent.allMacros.length} macros, ${resolvedContent.variablesWithDefinitions.length} variables, ${resolvedContent.functionsWithParams.length} functions`);
            
            // Send all user-defined content to UI providers
            // uiProvider.updateVariables({
            //     macros: resolvedContent.allMacros,
            //     variables: resolvedContent.variablesWithDefinitions,
            //     functions: resolvedContent.functionsWithParams
            // });
            // Cast to rich types with source info for Vue UI
            const variables = resolvedContent.variablesWithDefinitions as import('./types/calcpad').VariableDefinition[];
            const functions = resolvedContent.functionsWithParams as import('./types/calcpad').FunctionDefinition[];

            vueUiProvider.updateVariables({
                macros: resolvedContent.allMacros,
                variables: variables.map(v => ({
                    name: v.name,
                    definition: v.definition,
                    source: v.source,
                    sourceFile: v.sourceFile
                })),
                functions: functions.map(f => ({
                    name: f.name,
                    params: f.params.join('; '),
                    source: f.source,
                    sourceFile: f.sourceFile
                }))
            });
        } catch (error) {
            outputChannel.appendLine(`Error extracting macros: ${error}`);
        }
    }

    const insertManager = CalcpadInsertManager.getInstance();

    // Register webview provider for CalcPad Vue UI panel (NEW)
    const vueUiProvider = new CalcpadVueUIProvider(context.extensionUri, context, settingsManager, insertManager);
    const vueUiProviderDisposable = vscode.window.registerWebviewViewProvider(
        CalcpadVueUIProvider.viewType,
        vueUiProvider
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

    const refreshVariablesCommand = vscode.commands.registerCommand('calcpad.refreshVariables', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            await processDocument(activeEditor.document);
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


    // Process document on open
    const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(async document => {
        await processDocument(document);
    });

    // Process document on save
    const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(async document => {
        await processDocument(document);
    });

    // Lint on document change (with debouncing)
    let lintTimeout: NodeJS.Timeout | unknown = undefined;
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'calcpad' || event.document.languageId === 'plaintext') {
            if (lintTimeout) {
                clearTimeout(lintTimeout as NodeJS.Timeout);
            }
            lintTimeout = setTimeout(async () => {
                await processDocument(event.document);
            }, 500);
            // Only schedule preview update for CalcPad files
            schedulePreviewUpdate();
        }
    });

    // Update preview and variables when active editor changes
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor && (editor.document.languageId === 'calcpad' || editor.document.languageId === 'plaintext')) {
            // Update preview if panel is open
            if (activePreviewPanel) {
                schedulePreviewUpdate();
            }
            // Update Variables tab
            await processDocument(editor.document);
        }
    });

    // Process all open calcpad documents on activation
    vscode.workspace.textDocuments.forEach(async document => {
        await processDocument(document);
    });

        outputChannel.appendLine('Registering subscriptions...');
        context.subscriptions.push(
            disposable,
            previewCommand,
            previewUnwrappedCommand,
            showInsertCommand,
            printToPdfCommand,
            refreshVariablesCommand,
            exportToPdfCommand,
            vueUiProviderDisposable,
            vueUiProvider, // Add the provider itself for disposal
            linter, 
            outputChannel,
            onDidChangeTextDocument, 
            onDidOpenTextDocument, 
            onDidSaveTextDocument,
            onDidChangeActiveTextEditor,
            operatorReplacerDisposable,
            completionProviderDisposable
        );
        
        outputChannel.appendLine('CalcPad extension activation completed successfully');
        
    } catch (error) {
        console.error('CalcPad extension activation failed:', error);
        if (outputChannel) {
            outputChannel.appendLine(`FATAL ERROR during activation: ${error}`);
        }
        // Still try to show the error to user
        vscode.window.showErrorMessage(`CalcPad extension failed to activate: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error; // Re-throw to mark extension as failed
    }
}

export function deactivate() {
    if (linter) {
        linter.dispose();
    }
}