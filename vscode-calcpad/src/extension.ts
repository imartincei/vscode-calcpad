import * as vscode from 'vscode';
import * as path from 'path';
import { CalcpadApiClient, buildClientFileCacheFromContent } from 'calcpad-frontend';
import { CalcpadServerLinter } from './calcpadServerLinter';
import { CalcpadSemanticTokensProvider, semanticTokensLegend } from './calcpadSemanticTokensProvider';
import { CalcpadVueUIProvider } from './calcpadVueUIProvider';
import { CalcpadSettingsManager } from './calcpadSettings';
import { OperatorReplacer } from './operatorReplacer';
import { QuickTyper } from './quickTyper';
import { CalcpadCompletionProvider } from './calcpadCompletionProvider';
import { CalcpadInsertManager } from './calcpadInsertManager';
import { CalcpadDefinitionsService } from './calcpadDefinitionsService';
import { AutoIndenter } from './autoIndenter';
import { ImageInserter } from './imageInserter';
import { CalcpadDefinitionProvider } from './calcpadDefinitionProvider';
import { CommentFormatter } from './commentFormatter';
import { CalcpadServerManager } from './calcpadServerManager';
import { VSCodeLogger, VSCodeFileSystem } from './adapters';

let activePreviewPanel: vscode.WebviewPanel | unknown = undefined;
let activePreviewType: 'regular' | 'unwrapped' | undefined = undefined;
let previewUpdateTimeout: NodeJS.Timeout | unknown = undefined;
let previewSourceEditor: vscode.TextEditor | undefined = undefined;
let linter: CalcpadServerLinter;
let definitionsService: CalcpadDefinitionsService;
let serverManager: CalcpadServerManager | undefined;
let outputChannel: vscode.OutputChannel;
let calcpadOutputHtmlChannel: vscode.OutputChannel;
let calcpadWebviewHtmlChannel: vscode.OutputChannel;
let calcpadWebviewConsoleChannel: vscode.OutputChannel;
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

const IMAGE_MIME_MAP: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
};

/**
 * Scan HTML for <img src="..."> tags with local file paths, read the files from disk,
 * and return a cache mapping original src values to base64 data URIs.
 */
async function buildImageCache(html: string, documentDir: string): Promise<Record<string, string>> {
    const cache: Record<string, string> = {};
    const imgSrcRegex = /<img\s[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = imgSrcRegex.exec(html)) !== null) {
        const src = match[1];

        // Skip data URIs and remote URLs
        if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
            continue;
        }

        // Skip if already cached (same src used multiple times)
        if (cache[src]) {
            continue;
        }

        try {
            const absolutePath = path.resolve(documentDir, src);
            const ext = path.extname(absolutePath).toLowerCase().replace('.', '');
            const mimeType = IMAGE_MIME_MAP[ext];

            if (!mimeType) {
                outputChannel.appendLine(`[IMAGE CACHE] Skipping unsupported image type: ${src}`);
                continue;
            }

            const fileUri = vscode.Uri.file(absolutePath);
            const imageData = await vscode.workspace.fs.readFile(fileUri);
            const b64 = Buffer.from(imageData).toString('base64');
            cache[src] = `data:${mimeType};base64,${b64}`;

            outputChannel.appendLine(`[IMAGE CACHE] Cached: ${src} (${imageData.length} bytes)`);
        } catch (error) {
            outputChannel.appendLine(`[IMAGE CACHE] Could not read image: ${src} (${error instanceof Error ? error.message : 'Unknown error'})`);
        }
    }

    return cache;
}

/**
 * Generate a <script> block that replaces local image src attributes
 * with cached base64 data URIs on DOMContentLoaded.
 */
function getImageCacheScript(imageCache: Record<string, string>): string {
    if (Object.keys(imageCache).length === 0) {
        return '';
    }

    const cacheJson = JSON.stringify(imageCache);
    return `
        <script>
            (function() {
                const imageCache = ${cacheJson};
                document.addEventListener('DOMContentLoaded', function() {
                    const images = document.querySelectorAll('img');
                    images.forEach(function(img) {
                        const src = img.getAttribute('src');
                        if (src && imageCache[src]) {
                            img.src = imageCache[src];
                        }
                    });
                });
            })();
        </script>
    `;
}

/**
 * Generate a <script> that strips VS Code's auto-injected theme from the webview.
 * VS Code injects 400+ --vscode-* CSS variables on <html> and sets body classes
 * (vscode-dark/vscode-light) which override the server-generated theme CSS.
 * There is no API to disable this: https://github.com/microsoft/vscode/issues/209253
 * VS Code only re-injects on VS Code theme change, not continuously,
 * so stripping at DOMContentLoaded is stable.
 */
function getThemeOverrideScript(previewTheme: 'light' | 'dark'): string {
    const bodyClass = previewTheme === 'light' ? 'vscode-light' : 'vscode-dark';
    const themeKind = previewTheme === 'light' ? 'vscode-light' : 'vscode-dark';
    const bg = previewTheme === 'light' ? '#ffffff' : '#1a1a2e';
    return `
        <script>
            (function() {
                // Remove VS Code's injected inline styles (--vscode-* variables) from <html>
                document.documentElement.removeAttribute('style');
                // Set explicit background to prevent the webview container's grey from showing through
                document.documentElement.style.backgroundColor = '${bg}';

                // Set body classes to match the selected preview theme
                document.body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
                document.body.classList.add('${bodyClass}');
                document.body.setAttribute('data-vscode-theme-kind', '${themeKind}');
                document.body.style.backgroundColor = '${bg}';
            })();
        </script>
    `;
}

// Escape stray '<' that aren't part of complete HTML tags to prevent
// malformed user content (e.g. '<h' from Calcpad notes) from breaking the DOM.
// A complete tag is <...> where the content between < and > contains no nested <.
function sanitizeServerHtml(html: string): string {
    const bodyOpen = html.indexOf('<body');
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyOpen === -1 || bodyClose === -1) return html;

    const bodyStart = html.indexOf('>', bodyOpen) + 1;
    const body = html.substring(bodyStart, bodyClose);
    const sanitized = body.replace(/(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][^<>]*>)|(<)/g,
        (_match, comment, tag) => comment ?? tag ?? '&lt;');

    return html.substring(0, bodyStart) + sanitized + html.substring(bodyClose);
}

function getErrorNavigationScript(): string {
    return `
        <script>
            // Acquire VS Code API
            const vscode = acquireVsCodeApi();

            // Intercept console methods and send to VS Code
            (function() {
                const originalConsole = {
                    log: console.log,
                    warn: console.warn,
                    error: console.error,
                    info: console.info,
                    debug: console.debug
                };

                function sendConsoleMessage(level, args) {
                    const message = Array.from(args).map(arg => {
                        if (typeof arg === 'object') {
                            try {
                                return JSON.stringify(arg, null, 2);
                            } catch (e) {
                                return String(arg);
                            }
                        }
                        return String(arg);
                    }).join(' ');

                    vscode.postMessage({
                        type: 'consoleMessage',
                        level: level,
                        message: message
                    });
                }

                console.log = function() {
                    originalConsole.log.apply(console, arguments);
                    sendConsoleMessage('log', arguments);
                };

                console.warn = function() {
                    originalConsole.warn.apply(console, arguments);
                    sendConsoleMessage('warn', arguments);
                };

                console.error = function() {
                    originalConsole.error.apply(console, arguments);
                    sendConsoleMessage('error', arguments);
                };

                console.info = function() {
                    originalConsole.info.apply(console, arguments);
                    sendConsoleMessage('info', arguments);
                };

                console.debug = function() {
                    originalConsole.debug.apply(console, arguments);
                    sendConsoleMessage('debug', arguments);
                };
            })();

            // Test console interception
            console.log('CalcPad webview console interception initialized');

            // Handle error link clicks
            document.addEventListener('DOMContentLoaded', function() {
                // Find all error links with data-text attributes
                const errorLinks = document.querySelectorAll('a[data-text]');

                errorLinks.forEach(link => {
                    link.addEventListener('click', function(e) {
                        e.preventDefault();
                        const lineNumber = this.getAttribute('data-text');
                        if (lineNumber) {
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
}

async function updatePreviewContent(panel: vscode.WebviewPanel, content: string, sourceFileUri: vscode.Uri, unwrapped: boolean = false) {
    const mode = unwrapped ? 'unwrapped' : 'wrapped';
    outputChannel.appendLine(`Starting updatePreviewContent (${mode})...`);
    outputChannel.appendLine(`Content length: ${content.length} characters`);

    // Update panel title with current file name
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = activeEditor.document.fileName.split('/').pop() || 'CalcPad';
        panel.title = unwrapped ? `CalcPad Preview Unwrapped - ${fileName}` : `CalcPad Preview - ${fileName}`;
    }

    // Check if content is empty
    if (!content || content.trim().length === 0) {
        outputChannel.appendLine('Content is empty - showing empty state');
        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>CalcPad Preview${unwrapped ? ' Unwrapped' : ''}</title>
                <style>
                    body { color: #858585; background: var(--vscode-editor-background); padding: 20px; font-family: var(--vscode-font-family); }
                    h3 { text-align: center; }
                    p { text-align: center; }
                    table { margin: 1em auto; border-collapse: collapse; text-align: left; font-size: 0.9em; }
                    th, td { padding: 4px 12px; }
                    th { text-align: right; font-weight: normal; opacity: 0.7; }
                    td { font-family: var(--vscode-editor-font-family, monospace); }
                    h4 { text-align: center; margin-top: 1.5em; margin-bottom: 0.3em; }
                </style>
            </head>
            <body>
                <h3>Empty Document</h3>
                <p>Start typing CalcPad code to see the preview.</p>
                <h4>Formatting Hotkeys</h4>
                <table>
                    <tr><th>Bold</th><td>Ctrl+B</td></tr>
                    <tr><th>Italic</th><td>Ctrl+I</td></tr>
                    <tr><th>Underline</th><td>Ctrl+U</td></tr>
                    <tr><th>Subscript</th><td>Ctrl+=</td></tr>
                    <tr><th>Superscript</th><td>Ctrl+Shift+=</td></tr>
                    <tr><th>Heading 1-6</th><td>Ctrl+1 ... Ctrl+6</td></tr>
                    <tr><th>Paragraph</th><td>Ctrl+L</td></tr>
                    <tr><th>Line Break</th><td>Ctrl+R</td></tr>
                    <tr><th>Bulleted List</th><td>Ctrl+Shift+L</td></tr>
                    <tr><th>Numbered List</th><td>Ctrl+Shift+N</td></tr>
                    <tr><th>Toggle Comment</th><td>Ctrl+Q</td></tr>
                </table>
                <h4>Resources</h4>
                <p><a href="https://github.com/Proektsoftbg/Calcpad">Calcpad on GitHub</a></p>
                <p><a href="https://calcpad.eu/download/calcpad-readme.pdf">Calcpad README (PDF)</a></p>
            </body>
            </html>
        `;
        return;
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

        // Build client file cache for referenced files
        const vsFileSystem = new VSCodeFileSystem();
        const vsLogger = new VSCodeLogger(outputChannel);
        const sourceDir = path.dirname(sourceFileUri.fsPath);
        const clientFileCache = await buildClientFileCacheFromContent(content, sourceDir, vsFileSystem, vsLogger, '[Convert]');

        // Select API endpoint based on unwrapped parameter
        const endpoint = unwrapped ? '/api/calcpad/convert-unwrapped' : '/api/calcpad/convert';
        outputChannel.appendLine(`Making API call to ${endpoint}...`);

        const theme = getEffectivePreviewTheme();
        const response = await fetch(`${apiBaseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content,
                settings: settings,
                theme: theme,
                forceUnwrappedCode: unwrapped,
                clientFileCache: clientFileCache
            }),
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        outputChannel.appendLine('API call successful');

        // Use the entire API response as the webview HTML
        const apiResponse = await response.text();

        // Log to dedicated HTML output channel (without stealing focus)
        calcpadOutputHtmlChannel.clear();
        calcpadOutputHtmlChannel.appendLine(apiResponse);

        outputChannel.appendLine(`HTML Length: ${apiResponse.length} characters`);

        // Build image cache: read local image files and convert to base64 data URIs
        let imageCacheScript = '';
        if (activeEditor && !activeEditor.document.isUntitled) {
            const documentDir = path.dirname(activeEditor.document.uri.fsPath);
            const imageCache = await buildImageCache(apiResponse, documentDir);
            imageCacheScript = getImageCacheScript(imageCache);
        }

        // Inject JavaScript for error link navigation and console interception
        const errorNavigationScript = getErrorNavigationScript();

        // Override VS Code's injected theme to match the selected preview theme
        const themeOverrideScript = getThemeOverrideScript(theme);

        // Sanitize server HTML to escape stray '<' that aren't part of valid tags
        const sanitizedResponse = sanitizeServerHtml(apiResponse);

        // Inject scripts before closing body tag (theme override runs last to strip VS Code styles)
        const htmlWithScript = sanitizedResponse.replace('</body>', imageCacheScript + errorNavigationScript + themeOverrideScript + '</body>');

        // Log processed HTML to webview channel (without stealing focus)
        calcpadWebviewHtmlChannel.clear();
        calcpadWebviewHtmlChannel.appendLine(htmlWithScript);

        panel.webview.html = htmlWithScript;

        outputChannel.appendLine('Webview HTML set directly');

    } catch (error) {
        outputChannel.appendLine(`ERROR in updatePreviewContent: ${error instanceof Error ? error.message : 'Unknown error'}`);
        const settingsManager = CalcpadSettingsManager.getInstance(extensionContext);
        const calcpadSettings = settingsManager.getSettings();
        const errorApiBaseUrl = calcpadSettings.server.url;
        const endpoint = unwrapped ? 'convert-unwrapped' : 'convert';
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>CalcPad Preview Error</title>
            </head>
            <body>
                <div style="color: #d32f2f; background: #ffebee; padding: 15px; border-radius: 4px; margin: 20px;">
                    <h3>Preview Error${unwrapped ? ' (Unwrapped)' : ''}</h3>
                    <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                    <p>Server URL: ${errorApiBaseUrl}/api/calcpad/${endpoint}</p>
                </div>
            </body>
            </html>
        `;

        panel.webview.html = errorHtml;
    }
}

async function generatePdf(panel: vscode.WebviewPanel, content: string, sourceFileUri: vscode.Uri) {
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

        // Build client file cache for referenced files
        const vsFileSystem = new VSCodeFileSystem();
        const vsLogger = new VSCodeLogger(outputChannel);
        const sourceDir = path.dirname(sourceFileUri.fsPath);
        const clientFileCache = await buildClientFileCacheFromContent(content, sourceDir, vsFileSystem, vsLogger, '[PDF]');

        const response = await fetch(`${apiBaseUrl}/api/calcpad/convert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                settings: settings,
                outputFormat: 'pdf',
                clientFileCache: clientFileCache
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

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
            const pdfBuffer = await response.arrayBuffer();
            await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(pdfBuffer));

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
        const currentDir = path.dirname(activeEditor.document.fileName);
        const baseFilename = path.basename(activeEditor.document.fileName, path.extname(activeEditor.document.fileName));
        const defaultPath = path.join(currentDir, baseFilename + '.pdf');

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

                progress.report({ increment: 10, message: "Loading referenced files..." });

                // Build client file cache for referenced files
                const vsFileSystem = new VSCodeFileSystem();
                const vsLogger = new VSCodeLogger(outputChannel);
                const sourceDir = path.dirname(activeEditor.document.uri.fsPath);
                const clientFileCache = await buildClientFileCacheFromContent(documentContent, sourceDir, vsFileSystem, vsLogger, '[PDF]');

                progress.report({ increment: 20, message: "Calling PDF generation API..." });

                // Call the server's PDF generation API with outputFormat at top level
                const response = await fetch(`${apiBaseUrl}/api/calcpad/convert`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: documentContent,
                        settings: settings,
                        outputFormat: 'pdf',
                        pdfSettings: pdfSettings,
                        clientFileCache: clientFileCache
                    }),
                    signal: AbortSignal.timeout(60000)
                });
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }

                progress.report({ increment: 80, message: "Saving PDF file..." });

                // Write the PDF file
                const pdfBuffer = await response.arrayBuffer();
                await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(pdfBuffer));

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
        await updatePreviewContent(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText(), activeEditor.document.uri);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'htmlPreview',
        'CalcPad Preview',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            enableFindWidget: true
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
                        // data-text already contains the original source line (1-based)
                        // Just convert from 1-based to 0-based indexing
                        const lineIndex = Math.max(0, message.line - 1);
                        outputChannel.appendLine(`Navigating to source line ${message.line}`);

                        const position = new vscode.Position(lineIndex, 0);
                        const selection = new vscode.Selection(position, position);
                        sourceEditor.selection = selection;
                        sourceEditor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
                        vscode.window.showTextDocument(sourceEditor.document, vscode.ViewColumn.One);
                    }
                    break;
                case 'consoleMessage':
                    const timestamp = new Date().toISOString();
                    const level = message.level.toUpperCase();
                    calcpadWebviewConsoleChannel.appendLine(`[${timestamp}] [${level}] ${message.message}`);
                    break;
                default:
                    break;
            }
        }
    );

    await updatePreviewContent(panel, activeEditor.document.getText(), activeEditor.document.uri);
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
            enableScripts: true,
            enableFindWidget: true
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
                        // data-text already contains the original source line (1-based)
                        // Just convert from 1-based to 0-based indexing
                        const lineIndex = Math.max(0, message.line - 1);
                        outputChannel.appendLine(`Navigating to source line ${message.line}`);

                        const position = new vscode.Position(lineIndex, 0);
                        const selection = new vscode.Selection(position, position);
                        sourceEditor.selection = selection;
                        sourceEditor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
                        vscode.window.showTextDocument(sourceEditor.document, vscode.ViewColumn.One);
                    }
                    break;
                case 'consoleMessage':
                    const timestamp = new Date().toISOString();
                    const level = message.level.toUpperCase();
                    calcpadWebviewConsoleChannel.appendLine(`[${timestamp}] [${level}] ${message.message}`);
                    break;
                default:
                    break;
            }
        }
    );

    await updatePreviewContent(panel, activeEditor.document.getText(), activeEditor.document.uri, true);
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
            // Update the source editor reference when updating preview
            previewSourceEditor = activeEditor;
            await updatePreviewContent(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText(), activeEditor.document.uri);
        }
    }, 500);
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('VS Code CalcPad extension is now active!');
    
    try {
        // Store extension context for global access
        extensionContext = context;
        
        // Create output channel for debugging
        outputChannel = vscode.window.createOutputChannel('CalcPad Extension');
        outputChannel.appendLine('CalcPad extension activated');

        // Create dedicated output channels for HTML
        calcpadOutputHtmlChannel = vscode.window.createOutputChannel('Calcpad Output HTML');
        calcpadWebviewHtmlChannel = vscode.window.createOutputChannel('Calcpad Webview HTML');
        calcpadWebviewConsoleChannel = vscode.window.createOutputChannel('Calcpad Webview Console');

        // Create debug channel for linter/highlighter
        const serverDebugChannel = vscode.window.createOutputChannel('CalcPad Server Debug');

        outputChannel.appendLine('Initializing settings manager...');
        const settingsManager = CalcpadSettingsManager.getInstance(context);

        // Create shared API client
        const calcpadSettings = settingsManager.getSettings();
        const apiClient = new CalcpadApiClient(
            calcpadSettings.server.url,
            new VSCodeLogger(serverDebugChannel)
        );

        // Start bundled server if available
        const serverMode = calcpadSettings.server.mode || 'auto';
        outputChannel.appendLine(`Server mode: ${serverMode}`);

        if (serverMode === 'auto' || serverMode === 'local') {
            const dllExists = CalcpadServerManager.dllExists(context.extensionPath);
            outputChannel.appendLine(`Bundled DLL exists: ${dllExists}`);

            if (dllExists) {
                const config = vscode.workspace.getConfiguration('calcpad');
                const dotnetPath = config.get<string>('server.dotnetPath', 'dotnet');

                serverManager = new CalcpadServerManager(context.extensionPath, serverDebugChannel, dotnetPath);
                context.subscriptions.push(serverManager);

                try {
                    await serverManager.start();
                    const serverUrl = serverManager.getBaseUrl();
                    settingsManager.setServerUrl(serverUrl);
                    apiClient.setBaseUrl(serverUrl);
                    outputChannel.appendLine(`Local server started at ${serverUrl}`);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    outputChannel.appendLine(`Failed to start local server: ${message}`);
                    serverManager = undefined;

                    if (serverMode === 'local') {
                        vscode.window.showErrorMessage(`CalcPad: Failed to start local server: ${message}`);
                    } else {
                        outputChannel.appendLine('Falling back to remote API');
                    }
                }
            } else if (serverMode === 'local') {
                vscode.window.showErrorMessage('CalcPad: Server mode is "local" but CalcpadServer.dll was not found in the extension.');
            } else {
                outputChannel.appendLine('No bundled DLL found, using remote API');
            }
        }

        outputChannel.appendLine('Initializing linter...');
        linter = new CalcpadServerLinter(apiClient, serverDebugChannel);

        outputChannel.appendLine('Initializing definitions service...');
        definitionsService = new CalcpadDefinitionsService(apiClient, serverDebugChannel);

        // Initialize semantic token provider
        outputChannel.appendLine('Initializing semantic token provider...');
        const semanticTokensProvider = new CalcpadSemanticTokensProvider(apiClient, serverDebugChannel);
        const semanticTokensDisposable = vscode.languages.registerDocumentSemanticTokensProvider(
            { language: 'calcpad' },
            semanticTokensProvider,
            semanticTokensLegend
        );

        // Initialize operator replacer
        outputChannel.appendLine('Initializing operator replacer...');
        const operatorReplacer = new OperatorReplacer(outputChannel);
        const operatorReplacerDisposable = operatorReplacer.registerDocumentChangeListener(context);

        // Initialize quick typer
        outputChannel.appendLine('Initializing quick typer...');
        const quickTyper = new QuickTyper(outputChannel);
        const quickTyperDisposable = quickTyper.registerDocumentChangeListener(context);

        // Initialize auto-indenter
        outputChannel.appendLine('Initializing auto-indenter...');
        const autoIndenter = new AutoIndenter(outputChannel);
        const autoIndenterDisposable = autoIndenter.registerDocumentChangeListener(context);

        // Initialize image inserter
        outputChannel.appendLine('Initializing image inserter...');
        const imageInserter = new ImageInserter(outputChannel);
        const imagePasteDisposable = imageInserter.registerPasteProvider();
        const imageInsertCommandDisposable = imageInserter.registerInsertCommand();

        // Initialize comment formatter
        outputChannel.appendLine('Initializing comment formatter...');
        const commentFormatter = new CommentFormatter(outputChannel);
        const commentFormatterDisposables = commentFormatter.registerCommands();

        // Initialize insert manager (snippet service)
        outputChannel.appendLine('Initializing insert manager...');
        const insertManager = new CalcpadInsertManager(apiClient, outputChannel);

        // Initialize autocomplete provider
        outputChannel.appendLine('Initializing autocomplete provider...');
        const completionProviderDisposable = CalcpadCompletionProvider.register(definitionsService, insertManager, outputChannel);

        // Initialize definition provider (Go to Definition)
        outputChannel.appendLine('Initializing definition provider...');
        const definitionProviderDisposable = CalcpadDefinitionProvider.register(definitionsService, outputChannel);

    // Unified document processing function
    async function processDocument(document: vscode.TextDocument) {
        if (document.languageId !== 'calcpad' && document.languageId !== 'plaintext') {
            return;
        }

        outputChannel.appendLine('[processDocument] Processing document: ' + document.uri.fsPath);

        // Run linting
        await linter.lintDocument(document);

        // Fetch definitions from server and send to UI
        try {
            const definitions = await definitionsService.refreshDefinitions(document);

            if (definitions) {
                outputChannel.appendLine('[processDocument] Found ' + definitions.macros.length + ' macros, ' + definitions.variables.length + ' variables, ' + definitions.functions.length + ' functions, ' + definitions.customUnits.length + ' custom units');

                // Send definitions to Vue UI provider
                vueUiProvider.updateVariables({
                    macros: definitions.macros.map(m => ({
                        name: m.name,
                        params: m.parameters.length > 0 ? m.parameters.join('; ') : undefined,
                        definition: m.content.join('\n'),
                        source: m.source as 'local' | 'include',
                        sourceFile: m.sourceFile
                    })),
                    variables: definitions.variables.map(v => ({
                        name: v.name,
                        definition: v.expression,
                        source: v.source as 'local' | 'include',
                        sourceFile: v.sourceFile
                    })),
                    functions: definitions.functions.map(f => ({
                        name: f.name,
                        params: f.parameters.join('; '),
                        source: f.source as 'local' | 'include',
                        sourceFile: f.sourceFile
                    })),
                    customUnits: definitions.customUnits.map(u => ({
                        name: u.name,
                        definition: u.expression,
                        source: u.source as 'local' | 'include',
                        sourceFile: u.sourceFile
                    }))
                });
            } else {
                outputChannel.appendLine('[processDocument] No definitions returned from server');
            }
        } catch (error) {
            outputChannel.appendLine('Error fetching definitions: ' + error);
        }
    }

    // Centralized refresh function for when settings change
    async function refreshAllComponents() {
        outputChannel.appendLine('[Settings] Refreshing all components after settings change');

        // Sync API client URL with current settings
        const currentSettings = settingsManager.getSettings();
        apiClient.setBaseUrl(currentSettings.server.url);

        // Reload snippets from server
        try {
            await insertManager.reloadSnippets();
            outputChannel.appendLine('[Settings] Snippets reloaded');
        } catch (error) {
            outputChannel.appendLine('[Settings] Failed to reload snippets: ' + error);
        }

        // Refresh semantic tokens for all visible editors
        vscode.window.visibleTextEditors.forEach(editor => {
            if (editor.document.languageId === 'calcpad' || editor.document.languageId === 'plaintext') {
                semanticTokensProvider.refresh();
            }
        });

        // Reprocess active document (linting + definitions)
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            await processDocument(activeEditor.document);
        }

        // Refresh preview if open
        if (activePreviewPanel && activeEditor) {
            const unwrapped = activePreviewType === 'unwrapped';
            await updatePreviewContent(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText(), activeEditor.document.uri, unwrapped);
            outputChannel.appendLine('[Settings] Preview refreshed');
        }

        outputChannel.appendLine('[Settings] All components refreshed');
    }

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
            generatePdf(activePreviewPanel as vscode.WebviewPanel, activeEditor.document.getText(), activeEditor.document.uri);
        } else if (activeEditor) {
            // Create a temporary panel just for PDF generation
            const tempPanel = vscode.window.createWebviewPanel(
                'tempPdfPanel',
                'PDF Export',
                vscode.ViewColumn.Active,
                { enableScripts: false }
            );
            generatePdf(tempPanel, activeEditor.document.getText(), activeEditor.document.uri);
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

    // Refresh all components when calcpad settings change
    const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(async event => {
        // Check if any calcpad settings changed
        if (event.affectsConfiguration('calcpad')) {
            outputChannel.appendLine('[Settings] Calcpad settings changed - triggering refresh');
            await refreshAllComponents();
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
            semanticTokensDisposable,
            outputChannel,
            serverDebugChannel,
            onDidChangeTextDocument,
            onDidOpenTextDocument,
            onDidSaveTextDocument,
            onDidChangeActiveTextEditor,
            onDidChangeConfiguration,
            operatorReplacerDisposable,
            quickTyperDisposable,
            autoIndenterDisposable,
            imagePasteDisposable,
            imageInsertCommandDisposable,
            ...commentFormatterDisposables,
            completionProviderDisposable,
            definitionProviderDisposable,
            insertManager
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

export async function deactivate() {
    if (serverManager) {
        await serverManager.stop();
    }
    if (linter) {
        linter.dispose();
    }
}