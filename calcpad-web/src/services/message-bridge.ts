import { CalcpadApiClient } from 'calcpad-frontend/api/client';
import { CalcpadSnippetService } from 'calcpad-frontend/services/snippets';
import { CalcpadDefinitionsService } from 'calcpad-frontend/services/definitions';
import { getDefaultSettings, buildApiSettings } from 'calcpad-frontend/types/settings';
import type { CalcpadSettings } from 'calcpad-frontend/types/settings';

const SETTINGS_KEY = 'calcpad-settings';
const PDF_SETTINGS_KEY = 'calcpad-pdf-settings';

/**
 * In-process message bridge for the web platform.
 * Handles Vue sidebar messages locally — same role as calcpadVueUIProvider.ts
 * in the VS Code extension, but without IPC.
 */
export class MessageBridge {
    private apiClient: CalcpadApiClient;
    private snippetService: CalcpadSnippetService;
    private definitionsService: CalcpadDefinitionsService;
    private settings: CalcpadSettings;
    private _onInsertText: ((text: string) => void) | null = null;

    constructor(serverUrl: string) {
        const logger = { appendLine: (msg: string) => console.debug('[CalcPad]', msg) };
        this.apiClient = new CalcpadApiClient(serverUrl, logger);
        this.snippetService = new CalcpadSnippetService(this.apiClient, logger);
        this.definitionsService = new CalcpadDefinitionsService(this.apiClient);
        this.settings = this.loadSettings();

        // Load snippets on startup
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

    /**
     * Handle a message from the Vue sidebar.
     * This is called by the messaging adapter when Vue calls postMessage().
     */
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
                // Not supported in web context
                break;

            case 'updatePreviewTheme':
                localStorage.setItem('calcpad-preview-theme', message.theme);
                break;

            case 'updateQuickTyping':
                localStorage.setItem('calcpad-quick-typing', String(message.enabled));
                break;

            case 'updateCommentFormat':
                localStorage.setItem('calcpad-comment-format', message.format);
                break;

            case 'updateFormattingHotkeys':
                localStorage.setItem('calcpad-formatting-hotkeys', String(message.enabled));
                break;

            case 'updateLinterMinSeverity':
                localStorage.setItem('calcpad-linter-severity', message.severity);
                break;

            case 'getPdfSettings':
                this.handleGetPdfSettings();
                break;

            case 'updatePdfSettings':
                localStorage.setItem(PDF_SETTINGS_KEY, JSON.stringify(message.settings));
                break;

            case 'resetPdfSettings':
                localStorage.removeItem(PDF_SETTINGS_KEY);
                this.handleGetPdfSettings();
                break;

            case 'generatePdf':
                this.handleGeneratePdf();
                break;

            case 'debug':
                console.debug('[Vue]', message.message);
                break;
        }
    }

    /**
     * Post a message back to the Vue sidebar.
     * Dispatches a window MessageEvent so CalcpadApp.vue's listener picks it up.
     */
    private postToVue(message: unknown): void {
        window.dispatchEvent(new MessageEvent('message', { data: message }));
    }

    private async handleGetInsertData(): Promise<void> {
        const items = this.snippetService.getAllItems();
        if (items.length > 0) {
            this.postToVue({ type: 'insertDataResponse', items });
        } else {
            // Wait for snippets to load, then respond
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
            previewTheme: localStorage.getItem('calcpad-preview-theme') || 'system',
            commentFormat: localStorage.getItem('calcpad-comment-format') || 'auto',
            enableFormattingHotkeys: localStorage.getItem('calcpad-formatting-hotkeys') !== 'false',
            linterMinSeverity: localStorage.getItem('calcpad-linter-severity') || 'information',
        });
    }

    private handleUpdateSettings(newSettings: any): void {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));

        // Update API client base URL if server URL changed
        if (newSettings.server?.url) {
            this.apiClient.setBaseUrl(newSettings.server.url);
        }
    }

    private handleResetSettings(): void {
        this.settings = getDefaultSettings();
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        this.postToVue({ type: 'settingsReset', settings: this.settings });
    }

    private async handleGetVariables(): Promise<void> {
        // Get content from the Monaco editor via the current model
        const models = (window as any).monaco?.editor?.getModels?.();
        const content = models?.[0]?.getValue() || '';

        const response = await this.definitionsService.refreshDefinitions(content, 'web-editor');
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
        const stored = localStorage.getItem(PDF_SETTINGS_KEY);
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
            // Trigger browser download
            const blob = new Blob([result], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'calcpad-output.pdf';
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    private loadSettings(): CalcpadSettings {
        const stored = localStorage.getItem(SETTINGS_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch {
                // Fall through to defaults
            }
        }
        return getDefaultSettings();
    }
}
