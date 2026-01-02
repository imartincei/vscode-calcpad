import * as vscode from 'vscode';
import { CalcpadSettingsManager } from './calcpadSettings';
import { CalcpadInsertManager } from './calcpadInsertManager';
import axios from 'axios';

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
                    vscode.commands.executeCommand('vscode-calcpad.printToPdf');
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

                case 's3Login':
                    this.handleS3Login(data.credentials, webviewView.webview);
                    break;

                case 's3ListFiles':
                    this.handleS3ListFiles(data.token, webviewView.webview);
                    break;

                case 's3DownloadFile':
                    this.handleS3DownloadFile(data.fileName, data.token, webviewView.webview);
                    break;

                case 's3UploadFile':
                    this.handleS3UploadFile(data.fileName, data.fileData, data.tags, data.token, webviewView.webview);
                    break;

                case 'debug':
                    this._outputChannel.appendLine(`[Vue Debug] ${data.message}`);
                    break;
            }
        });

        // Send initial data
        this._sendInitialData();
    }

    private async _sendInitialData() {
        if (!this._view) return;

        // Ensure snippets are loaded
        if (!this._insertManager.isLoaded()) {
            try {
                await this._insertManager.loadSnippets();
            } catch (error) {
                this._outputChannel.appendLine('[Vue UI] Failed to load snippets: ' + error);
            }
        }

        // Send insert items as flat array
        const insertItems = this._insertManager.getAllItems();
        this._outputChannel.appendLine('Sending ' + insertItems.length + ' insert items');
        this._view.webview.postMessage({
            type: 'insertDataResponse',
            items: insertItems
        });
    }

    public updateVariables(data: { macros: any[], variables: any[], functions: any[], customUnits: any[] }) {
        if (this._view) {
            this._outputChannel.appendLine(`Updating variables: ${data.macros.length} macros, ${data.variables.length} variables, ${data.functions.length} functions, ${data.customUnits.length} custom units`);
            this._view.webview.postMessage({
                type: 'updateVariables',
                data: data
            });
        }
    }

    public dispose() {
        this._outputChannel.dispose();
    }

    private async handleS3Login(credentials: { username: string, password: string }, webview: vscode.Webview) {
        try {
            const config = vscode.workspace.getConfiguration('calcpad');
            const apiUrl = config.get<string>('s3.apiUrl', 'http://localhost:5000');

            this._outputChannel.appendLine(`[S3] Attempting login to: ${apiUrl}/api/auth/login`);
            this._outputChannel.appendLine(`[S3] Username: ${credentials.username}`);

            const response = await axios.post(`${apiUrl}/api/auth/login`, credentials);

            this._outputChannel.appendLine(`[S3] Login response status: ${response.status}`);
            this._outputChannel.appendLine(`[S3] Login response data: ${JSON.stringify(response.data, null, 2)}`);

            const jwt = response.data.token;
            this._outputChannel.appendLine(`[S3] Extracted JWT: ${jwt ? `${jwt.substring(0, 20)}...` : 'EMPTY'}`);

            webview.postMessage({
                type: 's3LoginResponse',
                success: true,
                token: response.data.token,
                user: response.data.user
            });
        } catch (error: unknown) {
            this._outputChannel.appendLine(`[S3] Login error: ${error}`);
            if (error instanceof Error) {
                this._outputChannel.appendLine(`[S3] Login error message: ${error.message}`);
                this._outputChannel.appendLine(`[S3] Login error stack: ${error.stack}`);
            }
            const errorMessage = axios.isAxiosError(error)
                ? error.response?.data?.message || 'Connection error. Make sure the S3 API is running.'
                : 'Connection error. Make sure the S3 API is running.';
            webview.postMessage({
                type: 's3LoginResponse',
                success: false,
                error: errorMessage
            });
        }
    }

    private async handleS3ListFiles(token: string, webview: vscode.Webview) {
        try {
            const config = vscode.workspace.getConfiguration('calcpad');
            const apiUrl = config.get<string>('s3.apiUrl', 'http://localhost:5000');

            this._outputChannel.appendLine(`[S3] Requesting file list from: ${apiUrl}/api/blobstorage/list-with-metadata`);
            this._outputChannel.appendLine(`[S3] Using token: ${token ? `${token.substring(0, 20)}...` : 'EMPTY'}`);

            const response = await axios.get(`${apiUrl}/api/blobstorage/list-with-metadata`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            this._outputChannel.appendLine(`[S3] Response status: ${response.status}`);
            this._outputChannel.appendLine(`[S3] Response data: ${JSON.stringify(response.data, null, 2)}`);

            const files = response.data.files || response.data || [];
            this._outputChannel.appendLine(`[S3] Extracted files array: ${JSON.stringify(files, null, 2)}`);
            this._outputChannel.appendLine(`[S3] Number of files found: ${Array.isArray(files) ? files.length : 'Not an array'}`);

            webview.postMessage({
                type: 's3FilesResponse',
                success: true,
                files: files
            });
        } catch (error: unknown) {
            this._outputChannel.appendLine(`[S3] List Files error: ${error}`);
            if (error instanceof Error) {
                this._outputChannel.appendLine(`[S3] Error message: ${error.message}`);
                this._outputChannel.appendLine(`[S3] Error stack: ${error.stack}`);
            }
            webview.postMessage({
                type: 's3FilesResponse',
                success: false,
                error: 'Failed to connect to S3 API'
            });
        }
    }

    private async handleS3DownloadFile(fileName: string, token: string, webview: vscode.Webview) {
        try {
            const config = vscode.workspace.getConfiguration('calcpad');
            const apiUrl = config.get<string>('s3.apiUrl', 'http://localhost:5000');

            this._outputChannel.appendLine(`[S3] Downloading file: ${fileName}`);
            this._outputChannel.appendLine(`[S3] Download URL: ${apiUrl}/api/blobstorage/download/${fileName}`);

            const response = await axios.get(`${apiUrl}/api/blobstorage/download/${fileName}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                responseType: 'arraybuffer'
            });

            this._outputChannel.appendLine(`[S3] Download response status: ${response.status}`);
            this._outputChannel.appendLine(`[S3] Download response size: ${response.data.byteLength} bytes`);

            const base64 = Buffer.from(response.data).toString('base64');

            webview.postMessage({
                type: 's3DownloadResponse',
                success: true,
                fileName: fileName,
                fileData: `data:application/octet-stream;base64,${base64}`
            });
        } catch (error: unknown) {
            this._outputChannel.appendLine(`[S3] Download error: ${error}`);
            if (error instanceof Error) {
                this._outputChannel.appendLine(`[S3] Download error message: ${error.message}`);
            }
            webview.postMessage({
                type: 's3DownloadResponse',
                success: false,
                error: 'Download failed'
            });
        }
    }

    private async handleS3UploadFile(fileName: string, fileData: string, tags: string[], token: string, webview: vscode.Webview) {
        try {
            const config = vscode.workspace.getConfiguration('calcpad');
            const apiUrl = config.get<string>('s3.apiUrl', 'http://localhost:5000');

            this._outputChannel.appendLine(`[S3] Uploading file: ${fileName}`);
            this._outputChannel.appendLine(`[S3] Upload URL: ${apiUrl}/api/blobstorage/upload`);
            this._outputChannel.appendLine(`[S3] Tags: ${JSON.stringify(tags)}`);

            // Convert base64 data URL to buffer
            const base64Data = fileData.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');

            this._outputChannel.appendLine(`[S3] File size: ${buffer.length} bytes`);

            // Use native FormData (available in Node.js 18+)
            const formData = new (globalThis as typeof globalThis & { FormData: typeof FormData }).FormData();

            // Create a Blob for the file
            const fileBlob = new Blob([buffer], { type: 'application/octet-stream' });
            formData.append('file', fileBlob, fileName);

            if (tags.length > 0) {
                formData.append('tags', JSON.stringify(tags));
            }

            const response = await axios.post(`${apiUrl}/api/blobstorage/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                    // Let axios handle Content-Type with boundary automatically
                }
            });

            this._outputChannel.appendLine(`[S3] Upload response status: ${response.status}`);
            this._outputChannel.appendLine(`[S3] Upload successful for: ${fileName}`);

            webview.postMessage({
                type: 's3UploadResponse',
                success: true
            });
        } catch (error: unknown) {
            this._outputChannel.appendLine(`[S3] Upload error: ${error}`);
            if (error instanceof Error) {
                this._outputChannel.appendLine(`[S3] Upload error message: ${error.message}`);
            }
            webview.postMessage({
                type: 's3UploadResponse',
                success: false,
                error: 'Upload failed'
            });
        }
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