import { filesystem, os, storage } from '@neutralinojs/lib';
import { CalcpadApiClient } from 'calcpad-frontend/api/client';
import { CalcpadSnippetService } from 'calcpad-frontend/services/snippets';
import { CalcpadDefinitionsService } from 'calcpad-frontend/services/definitions';
import { getDefaultSettings, buildApiSettings } from 'calcpad-frontend/types/settings';
import type { CalcpadSettings } from 'calcpad-frontend/types/settings';

const SETTINGS_KEY = 'calcpad-settings';

/**
 * Message bridge for the Neutralino.js desktop platform.
 * Same role as the web MessageBridge, but uses Neutralino APIs for native
 * file dialogs, filesystem access, and persistent storage.
 */
export class NeutralinoMessageBridge {
    private apiClient: CalcpadApiClient;
    private snippetService: CalcpadSnippetService;
    private definitionsService: CalcpadDefinitionsService;
    private settings: CalcpadSettings;
    private _onInsertText: ((text: string) => void) | null = null;
    private _extraSettings: Record<string, string> = {};

    constructor(serverUrl: string) {
        this.apiClient = new CalcpadApiClient(serverUrl);
        this.snippetService = new CalcpadSnippetService(this.apiClient);
        this.definitionsService = new CalcpadDefinitionsService(this.apiClient);
        this.settings = getDefaultSettings();

        this.loadSettingsFromStorage();
        this.snippetService.loadSnippets();
    }

    get api(): CalcpadApiClient {
        return this.apiClient;
    }

    get snippets(): CalcpadSnippetService {
        return this.snippetService;
    }

    set onInsertText(handler: (text: string) => void) {
        this._onInsertText = handler;
    }

    handleMessage(message: any): void {
        switch (message.type) {
            case 'getInsertData':
                this.handleGetInsertData();
                break;
            case 'getSettings':
                this.handleGetSettings();
                break;
            case 'updateSettings':
                this.handleUpdateSettings(message.settings);
                break;
            case 'resetSettings':
                this.handleResetSettings();
                break;
            case 'getVariables':
                this.handleGetVariables();
                break;
            case 'insertText':
                if (this._onInsertText) {
                    this._onInsertText(message.text);
                }
                break;
            case 'insertImage':
                // Not yet supported in Neutralino context
                break;
            case 'updatePreviewTheme':
                this.persistSetting('previewTheme', message.theme);
                break;
            case 'updateQuickTyping':
                this.persistSetting('quickTyping', String(message.enabled));
                break;
            case 'updateCommentFormat':
                this.persistSetting('commentFormat', message.format);
                break;
            case 'updateFormattingHotkeys':
                this.persistSetting('formattingHotkeys', String(message.enabled));
                break;
            case 'updateLinterMinSeverity':
                this.persistSetting('linterMinSeverity', message.severity);
                break;
            case 'getPdfSettings':
                this.handleGetPdfSettings();
                break;
            case 'updatePdfSettings':
                this.persistSetting('pdfSettings', JSON.stringify(message.settings));
                break;
            case 'resetPdfSettings':
                this.persistSetting('pdfSettings', '');
                this.handleGetPdfSettings();
                break;
            case 'generatePdf':
                this.handleGeneratePdf();
                break;
            case 'debug':
                break;
        }
    }

    // ---- File operations (exposed for menu actions) ----

    async openFile(): Promise<{ path: string; content: string } | null> {
        const entries = await os.showOpenDialog('Open File', {
            filters: [
                { name: 'CalcPad Files', extensions: ['cpd'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });

        if (!entries || entries.length === 0) return null;

        const filePath = entries[0];
        const content = await filesystem.readFile(filePath);
        return { path: filePath, content };
    }

    async saveFile(filePath: string, content: string): Promise<void> {
        await filesystem.writeFile(filePath, content);
    }

    async saveFileAs(content: string): Promise<string | null> {
        const filePath = await os.showSaveDialog('Save File', {
            filters: [
                { name: 'CalcPad Files', extensions: ['cpd'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });

        if (!filePath) return null;

        await filesystem.writeFile(filePath, content);
        return filePath;
    }

    // ---- Internal message handlers ----

    private postToVue(message: unknown): void {
        window.dispatchEvent(new MessageEvent('message', { data: message }));
    }

    private async handleGetInsertData(): Promise<void> {
        const items = this.snippetService.getAllItems();
        if (items.length > 0) {
            this.postToVue({ type: 'insertDataResponse', items });
        } else {
            this.snippetService.onSnippetsLoaded(() => {
                this.postToVue({
                    type: 'insertDataResponse',
                    items: this.snippetService.getAllItems(),
                });
            });
        }
    }

    private handleGetSettings(): void {
        this.postToVue({
            type: 'settingsResponse',
            settings: this.settings,
            previewTheme: this._extraSettings.previewTheme || 'system',
            commentFormat: this._extraSettings.commentFormat || 'auto',
            enableFormattingHotkeys: this._extraSettings.formattingHotkeys !== 'false',
            linterMinSeverity: this._extraSettings.linterMinSeverity || 'information',
        });
    }

    private handleUpdateSettings(newSettings: any): void {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettingsToStorage();

        if (newSettings.server?.url) {
            this.apiClient.setBaseUrl(newSettings.server.url);
        }
    }

    private handleResetSettings(): void {
        this.settings = getDefaultSettings();
        this.saveSettingsToStorage();
        this.postToVue({ type: 'settingsReset', settings: this.settings });
    }

    private async handleGetVariables(): Promise<void> {
        const models = (window as any).monaco?.editor?.getModels?.();
        const content = models?.[0]?.getValue() || '';

        const response = await this.definitionsService.refreshDefinitions(content, 'desktop-editor');
        if (response) {
            this.postToVue({
                type: 'updateVariables',
                data: {
                    macros: response.macros || [],
                    variables: response.variables || [],
                    functions: response.functions || [],
                    customUnits: response.customUnits || [],
                },
            });
        } else {
            this.postToVue({
                type: 'updateVariables',
                data: { macros: [], variables: [], functions: [], customUnits: [] },
            });
        }
    }

    private handleGetPdfSettings(): void {
        const stored = this._extraSettings.pdfSettings;
        const settings = stored ? JSON.parse(stored) : {
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
            scale: 1.0,
        };
        this.postToVue({ type: 'pdfSettingsResponse', settings });
    }

    private async handleGeneratePdf(): Promise<void> {
        const models = (window as any).monaco?.editor?.getModels?.();
        const content = models?.[0]?.getValue() || '';
        const apiSettings = buildApiSettings(this.settings);

        const result = await this.apiClient.convert(content, apiSettings, 'pdf');
        if (result instanceof ArrayBuffer) {
            const filePath = await os.showSaveDialog('Export PDF', {
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
            });

            if (filePath) {
                await filesystem.writeBinaryFile(filePath, result);
            }
        }
    }

    // ---- Settings persistence via Neutralino.storage ----

    private async loadSettingsFromStorage(): Promise<void> {
        try {
            const raw = await storage.getData(SETTINGS_KEY);
            const data = JSON.parse(raw);
            if (data.calcpadSettings) {
                this.settings = data.calcpadSettings;
            }
            if (data.extraSettings) {
                this._extraSettings = data.extraSettings;
            }
        } catch {
            // No stored settings yet — use defaults
        }
    }

    private saveSettingsToStorage(): void {
        storage.setData(SETTINGS_KEY, JSON.stringify({
            calcpadSettings: this.settings,
            extraSettings: this._extraSettings,
        }));
    }

    private persistSetting(key: string, value: string): void {
        this._extraSettings[key] = value;
        this.saveSettingsToStorage();
    }
}
