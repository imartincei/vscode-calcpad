import * as vscode from 'vscode';
import { CalcpadSettingsManager } from './calcpadSettings';
import { CalcpadInsertManager } from './calcpadInsertManager';
import { CalcpadContentResolver } from './calcpadContentResolver';

export class CalcpadUIProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'calcpadUI';

    private _view?: vscode.WebviewView;
    private _contentResolver: CalcpadContentResolver;
    private _outputChannel: vscode.OutputChannel;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
        private readonly _settingsManager: CalcpadSettingsManager,
        private readonly _insertManager: CalcpadInsertManager
    ) {
        this._outputChannel = vscode.window.createOutputChannel('Calcpad Webview');
        this._contentResolver = new CalcpadContentResolver(this._settingsManager, this._outputChannel);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            async (message) => {

                switch (message.type) {
                    case 'getSettings':
                        // Send current settings to webview
                        const settings = this._settingsManager.getSettings();
                        const previewTheme = vscode.workspace.getConfiguration('calcpad').get<string>('preview.theme');
                        webviewView.webview.postMessage({
                            type: 'settingsResponse',
                            settings: settings,
                            previewTheme: previewTheme
                        });
                        break;
                    case 'updateSettings':
                        // Update settings from webview
                        this._settingsManager.updateSettings(message.settings);
                        break;
                    case 'resetSettings':
                        // Reset settings to defaults
                        this._settingsManager.resetSettings();
                        const resetSettings = this._settingsManager.getSettings();
                        webviewView.webview.postMessage({
                            type: 'settingsReset',
                            settings: resetSettings
                        });
                        break;
                    case 'updatePreviewTheme':
                        // Update VS Code preview theme setting
                        const config = vscode.workspace.getConfiguration('calcpad');
                        config.update('preview.theme', message.theme, vscode.ConfigurationTarget.Global);
                        break;
                    case 'updatePdfSettings':
                        // Update PDF settings
                        this.updatePdfConfig(message.settings);
                        break;
                    case 'resetPdfSettings':
                        // Reset PDF settings
                        this.resetPdfConfig();
                        break;
                    case 'insertText':
                        // Insert text into active editor
                        this.insertTextIntoActiveEditor(message.text);
                        break;
                    case 'storeS3JWT':
                        // Store S3 JWT for authentication
                        this._context.secrets.store('calcpad.s3.jwt', message.jwt);
                        this._outputChannel.appendLine('[S3Auth] JWT stored for CalcPad operations');
                        break;
                    case 'clearS3JWT':
                        // Clear S3 JWT
                        this._context.secrets.delete('calcpad.s3.jwt');
                        this._outputChannel.appendLine('[S3Auth] JWT cleared');
                        break;
                    case 'getS3Config':
                        // Send S3 config to webview
                        this.sendS3Config(webviewView);
                        break;
                    case 'openS3Config':
                        // Open S3 config file in editor
                        this.openS3ConfigFile();
                        break;
                    case 'debug':
                        // Debug logging
                        this._outputChannel.appendLine(message.message);
                        break;
                }
            },
            undefined,
            this._context.subscriptions
        );

        // Process current document if available
        if (vscode.window.activeTextEditor?.document) {
            this._outputChannel.appendLine(`[resolveWebviewView] Processing current document: ${vscode.window.activeTextEditor.document.fileName}`);
            this.processCurrentDocument();
        }
    }

    private processCurrentDocument() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        const document = activeEditor.document;

        this._outputChannel.appendLine(`[processCurrentDocument] Processing document: ${document.uri.fsPath}`);

        try {
            const resolvedContent = this._contentResolver.getCompiledContent(document);

            this._outputChannel.appendLine(`[processCurrentDocument] Found ${resolvedContent.allMacros.length} macros, ${resolvedContent.variablesWithDefinitions.length} variables, ${resolvedContent.functionsWithParams.length} functions`);

            this.updateVariables({
                macros: resolvedContent.allMacros,
                variables: resolvedContent.variablesWithDefinitions,
                functions: resolvedContent.functionsWithParams
            });

        } catch (error) {
            this._outputChannel.appendLine(`[processCurrentDocument] Error: ${error}`);
        }
    }

    public updateVariables(data: { macros: any[], variables: any[], functions: any[] }) {
        this._outputChannel.appendLine(`[updateVariables] Called with ${data.macros.length} macros, ${data.variables.length} variables, ${data.functions.length} functions`);

        if (this._view) {
            this._outputChannel.appendLine(`[updateVariables] Sending to CalcPad UI webview (viewType: ${CalcpadUIProvider.viewType})`);
            this._view.webview.postMessage({
                type: 'updateVariables',
                data: data
            });
        }
    }

    private insertTextIntoActiveEditor(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = editor.selection.active;
            editor.edit(editBuilder => {
                editBuilder.insert(position, text);
            });
        }
    }

    private updatePdfConfig(settings: any) {
        const config = vscode.workspace.getConfiguration('pdf');
        Object.keys(settings).forEach(key => {
            config.update(`pdf.${key}`, settings[key], vscode.ConfigurationTarget.Global);
        });
    }

    private resetPdfConfig() {
        const config = vscode.workspace.getConfiguration('pdf');
        // Reset to default PDF settings
        const defaultPdfSettings = {
            enableHeader: true,
            enableFooter: true,
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

        Object.keys(defaultPdfSettings).forEach(key => {
            const value = (defaultPdfSettings as any)[key];
            config.update(`pdf.${key}`, value, vscode.ConfigurationTarget.Global);
        });
    }

    private getS3ConfigPath(): { runtimePath: string; sourcePath: string } {
        const path = require('path');
        return {
            runtimePath: path.join(__dirname, 's3-config.json'), // For reading config during runtime
            sourcePath: path.join(this._extensionUri.fsPath, 's3-config.json') // For editing the source file
        };
    }

    private sendS3Config(webviewView: vscode.WebviewView): void {
        const fs = require('fs');
        const { runtimePath } = this.getS3ConfigPath();

        const configContent = fs.readFileSync(runtimePath, 'utf8');
        const configData = JSON.parse(configContent);

        if (!configData.apiBaseUrl) {
            throw new Error('apiBaseUrl not found in s3-config.json');
        }

        webviewView.webview.postMessage({
            type: 's3ConfigResponse',
            apiUrl: configData.apiBaseUrl
        });
    }

    private async openS3ConfigFile(): Promise<void> {
        const { sourcePath } = this.getS3ConfigPath();
        const configUri = vscode.Uri.file(sourcePath);

        // Open the file in the editor - will fail if doesn't exist
        const document = await vscode.workspace.openTextDocument(configUri);
        await vscode.window.showTextDocument(document);

        this._outputChannel.appendLine(`Opened S3 config file: ${sourcePath}`);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get resource URIs for webview files
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'styles.css'));
        const mainJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js'));
        const s3ManagerJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 's3Manager.js'));

        // Get insert data for the webview
        const insertData = this._insertManager.getInsertData();
        const insertDataString = JSON.stringify(insertData);

        this._outputChannel.appendLine(`[WebviewHTML] CSS URI: ${cssUri.toString()}`);
        this._outputChannel.appendLine(`[WebviewHTML] Main JS URI: ${mainJsUri.toString()}`);
        this._outputChannel.appendLine(`[WebviewHTML] S3 Manager JS URI: ${s3ManagerJsUri.toString()}`);
        this._outputChannel.appendLine(`[WebviewHTML] Insert data keys: ${Object.keys(insertData || {})}`);

        // Read the HTML template from external file
        const fs = require('fs');
        const path = require('path');
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'index.html');
        let htmlTemplate = fs.readFileSync(htmlPath, 'utf8');

        this._outputChannel.appendLine(`[WebviewHTML] HTML template loaded, length: ${htmlTemplate.length}`);

        // Replace placeholders with actual URIs and data
        const beforeCss = htmlTemplate.includes('./styles.css');
        htmlTemplate = htmlTemplate
            .replace('./styles.css', cssUri.toString())
            .replace('PLACEHOLDER_MAIN_JS_URI', mainJsUri.toString())
            .replace('PLACEHOLDER_INSERT_DATA', insertDataString)
            .replace('PLACEHOLDER_S3_MANAGER_JS_URI', s3ManagerJsUri.toString());
        const afterCss = htmlTemplate.includes('./styles.css');

        this._outputChannel.appendLine(`[WebviewHTML] CSS replacement: before=${beforeCss}, after=${afterCss}`);

        // Log a sample of the generated HTML to verify CSS link
        const cssLinkMatch = htmlTemplate.match(/<link[^>]*stylesheet[^>]*>/i);
        if (cssLinkMatch) {
            this._outputChannel.appendLine(`[WebviewHTML] CSS link found: ${cssLinkMatch[0]}`);
        } else {
            this._outputChannel.appendLine(`[WebviewHTML] ERROR: No CSS link found in HTML`);
        }

        this._outputChannel.appendLine(`[WebviewHTML] Template replacements completed`);

        return htmlTemplate;
    }
}
