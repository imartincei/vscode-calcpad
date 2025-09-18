import * as vscode from 'vscode';
import * as path from 'path';
import { CalcpadSettingsManager } from './calcpadSettings';
import { CalcpadInsertManager } from './calcpadInsertManager';

export class CalcpadVueUIProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'calcpadVueUI';

    private _view?: vscode.WebviewView;
    private _outputChannel: vscode.OutputChannel;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
        private readonly _settingsManager: CalcpadSettingsManager,
        private readonly _insertManager: CalcpadInsertManager
    ) {
        this._outputChannel = vscode.window.createOutputChannel('CalcPad Vue');
        this._outputChannel.appendLine('CalcPad Vue UI Provider initialized');
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        this._outputChannel.appendLine('Resolving Vue webview view');

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        this._outputChannel.appendLine('Webview HTML set');

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            this._outputChannel.appendLine(`Received message: ${data.type}`);
            switch (data.type) {
                case 'insertText':
                    const insertEditor = vscode.window.activeTextEditor;
                    if (insertEditor) {
                        const position = insertEditor.selection.active;
                        await insertEditor.edit(editBuilder => {
                            editBuilder.insert(position, data.text);
                        });
                    }
                    break;

                case 'getSettings':
                    const settings = this._settingsManager.getSettings();
                    const config = vscode.workspace.getConfiguration('calcpad');
                    const previewTheme = config.get<string>('previewTheme', 'system');

                    webviewView.webview.postMessage({
                        type: 'settingsResponse',
                        settings: settings,
                        previewTheme: previewTheme
                    });
                    break;

                case 'updateSettings':
                    this._settingsManager.updateSettings(data.settings);
                    break;

                case 'resetSettings':
                    this._settingsManager.resetSettings();
                    const resetSettings = this._settingsManager.getSettings();
                    webviewView.webview.postMessage({
                        type: 'settingsReset',
                        settings: resetSettings
                    });
                    break;

                case 'updatePreviewTheme':
                    const previewConfig = vscode.workspace.getConfiguration('calcpad');
                    await previewConfig.update('previewTheme', data.theme, vscode.ConfigurationTarget.Global);
                    break;

                case 'updatePdfSettings':
                    const pdfConfig = vscode.workspace.getConfiguration('calcpad');
                    for (const [key, value] of Object.entries(data.settings)) {
                        await pdfConfig.update(`pdf.${key}`, value, vscode.ConfigurationTarget.Global);
                    }
                    break;

                case 'resetPdfSettings':
                    const pdfConfigReset = vscode.workspace.getConfiguration('calcpad');
                    const pdfKeys = [
                        'enableHeader', 'documentTitle', 'documentSubtitle', 'headerCenter', 'author',
                        'enableFooter', 'footerCenter', 'company', 'project', 'showPageNumbers',
                        'format', 'orientation', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
                        'printBackground', 'scale'
                    ];

                    for (const key of pdfKeys) {
                        await pdfConfigReset.update(`pdf.${key}`, undefined, vscode.ConfigurationTarget.Global);
                    }

                    // Send back the reset settings
                    const resetPdfSettings = {
                        enableHeader: true,
                        documentTitle: '',
                        documentSubtitle: '',
                        headerCenter: '',
                        author: '',
                        enableFooter: true,
                        footerCenter: '',
                        company: '',
                        project: '',
                        showPageNumbers: true,
                        format: 'A4',
                        orientation: 'portrait',
                        marginTop: '2cm',
                        marginBottom: '2cm',
                        marginLeft: '1.5cm',
                        marginRight: '1.5cm',
                        printBackground: true,
                        scale: 1.0
                    };

                    webviewView.webview.postMessage({
                        type: 'pdfSettingsReset',
                        settings: resetPdfSettings
                    });
                    break;

                case 'openS3Config':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'calcpad.s3');
                    break;

                case 'getS3Config':
                    const s3Config = vscode.workspace.getConfiguration('calcpad');
                    const s3ApiUrl = s3Config.get<string>('s3.apiUrl', '');
                    webviewView.webview.postMessage({
                        type: 's3ConfigResponse',
                        apiUrl: s3ApiUrl
                    });
                    break;

                case 'getPdfSettings':
                    const pdfConfigGet = vscode.workspace.getConfiguration('calcpad');
                    const pdfSettings = {
                        enableHeader: pdfConfigGet.get<boolean>('pdf.enableHeader', true),
                        documentTitle: pdfConfigGet.get<string>('pdf.documentTitle', ''),
                        documentSubtitle: pdfConfigGet.get<string>('pdf.documentSubtitle', ''),
                        headerCenter: pdfConfigGet.get<string>('pdf.headerCenter', ''),
                        author: pdfConfigGet.get<string>('pdf.author', ''),
                        enableFooter: pdfConfigGet.get<boolean>('pdf.enableFooter', true),
                        footerCenter: pdfConfigGet.get<string>('pdf.footerCenter', ''),
                        company: pdfConfigGet.get<string>('pdf.company', ''),
                        project: pdfConfigGet.get<string>('pdf.project', ''),
                        showPageNumbers: pdfConfigGet.get<boolean>('pdf.showPageNumbers', true),
                        format: pdfConfigGet.get<string>('pdf.format', 'A4'),
                        orientation: pdfConfigGet.get<string>('pdf.orientation', 'portrait'),
                        marginTop: pdfConfigGet.get<string>('pdf.marginTop', '2cm'),
                        marginBottom: pdfConfigGet.get<string>('pdf.marginBottom', '2cm'),
                        marginLeft: pdfConfigGet.get<string>('pdf.marginLeft', '1.5cm'),
                        marginRight: pdfConfigGet.get<string>('pdf.marginRight', '1.5cm'),
                        printBackground: pdfConfigGet.get<boolean>('pdf.printBackground', true),
                        scale: pdfConfigGet.get<number>('pdf.scale', 1.0)
                    };

                    webviewView.webview.postMessage({
                        type: 'pdfSettingsResponse',
                        settings: pdfSettings
                    });
                    break;

                case 'generatePdf':
                    vscode.commands.executeCommand('calcpad.printToPdf');
                    break;

                case 'getInsertData':
                    this._sendInitialData();
                    break;

                case 'getVariables':
                    // Trigger a refresh of variables from the current document
                    const editor = vscode.window.activeTextEditor;
                    if (editor && (editor.document.languageId === 'calcpad' || editor.document.languageId === 'plaintext')) {
                        vscode.commands.executeCommand('calcpad.refreshVariables');
                    }
                    break;

                case 'debug':
                    this._outputChannel.appendLine(`[Vue Debug] ${data.message}`);
                    break;
            }
        });

        // Send initial data
        this._sendInitialData();
    }

    private _sendInitialData() {
        if (!this._view) return;

        // Send insert data
        const insertData = this._insertManager.getInsertData();
        this._outputChannel.appendLine(`Sending insert data with ${Object.keys(insertData || {}).length} categories`);
        this._view.webview.postMessage({
            type: 'insertDataResponse',
            data: insertData
        });
    }

    public updateVariables(data: { macros: any[], variables: any[], functions: any[] }) {
        if (this._view) {
            this._outputChannel.appendLine(`Updating variables: ${data.macros.length} macros, ${data.variables.length} variables, ${data.functions.length} functions`);
            this._view.webview.postMessage({
                type: 'updateVariables',
                data: data
            });
        }
    }

    public dispose() {
        this._outputChannel.dispose();
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'CalcpadVuePanel', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'CalcpadVuePanel', 'style.css'));

        this._outputChannel.appendLine(`Script URI: ${scriptUri.toString()}`);
        this._outputChannel.appendLine(`Style URI: ${styleUri.toString()}`);

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>CalcPad Vue UI</title>
</head>
<body>
    <div id="app">
        <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
            Loading Vue.js CalcPad UI...
            <br><small>If this message persists, check the developer console for errors</small>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}