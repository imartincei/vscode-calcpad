import * as vscode from 'vscode';
import axios from 'axios';
import { CalcpadSettingsManager } from './calcpadSettings';
import {
    DefinitionsRequest,
    DefinitionsResponse,
    ClientFileCache
} from './api/calcpadApiTypes';
import { buildClientFileCacheFromContent } from './clientFileCacheHelper';

/**
 * Service for fetching and caching definitions from the Calcpad server.
 * Provides macros, functions, variables, and custom units for a document.
 */
export class CalcpadDefinitionsService {
    private debugChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;
    private requestId = 0;

    // Cache definitions per document URI
    private cache = new Map<string, DefinitionsResponse>();

    constructor(settingsManager: CalcpadSettingsManager, debugChannel: vscode.OutputChannel) {
        this.settingsManager = settingsManager;
        this.debugChannel = debugChannel;
    }

    /**
     * Get definitions for a document, using cache if available.
     * Call refreshDefinitions() to force a refresh.
     */
    public getCachedDefinitions(documentUri: string): DefinitionsResponse | undefined {
        return this.cache.get(documentUri);
    }

    /**
     * Fetch definitions from the server and update the cache.
     */
    public async refreshDefinitions(document: vscode.TextDocument): Promise<DefinitionsResponse | null> {
        const content = document.getText();
        const reqId = ++this.requestId;
        const startTime = Date.now();

        this.debugChannel.appendLine('[Definitions #' + reqId + '] Request started for ' + document.fileName + ' (' + content.length + ' chars)');

        // Skip empty documents
        if (!content.trim()) {
            this.debugChannel.appendLine('[Definitions #' + reqId + '] Skipped - empty document');
            this.cache.delete(document.uri.toString());
            return null;
        }

        try {
            // Build client file cache for referenced files
            const clientFileCache = await buildClientFileCacheFromContent(content, this.debugChannel, '[Definitions #' + reqId + ']');

            const definitions = await this.fetchDefinitions(content, reqId, clientFileCache);

            if (definitions) {
                this.cache.set(document.uri.toString(), definitions);
                this.debugChannel.appendLine('[Definitions #' + reqId + '] Cached ' +
                    definitions.macros.length + ' macros, ' +
                    definitions.functions.length + ' functions, ' +
                    definitions.variables.length + ' variables, ' +
                    definitions.customUnits.length + ' custom units in ' +
                    (Date.now() - startTime) + 'ms');
            } else {
                this.debugChannel.appendLine('[Definitions #' + reqId + '] No definitions returned after ' + (Date.now() - startTime) + 'ms');
            }

            return definitions;
        } catch (error) {
            this.debugChannel.appendLine('[Definitions #' + reqId + '] Error after ' + (Date.now() - startTime) + 'ms: ' + (error instanceof Error ? error.message : 'Unknown error'));
            return null;
        }
    }

    /**
     * Fetch definitions from the server.
     */
    private async fetchDefinitions(content: string, reqId: number, clientFileCache?: ClientFileCache): Promise<DefinitionsResponse | null> {
        const settings = this.settingsManager.getSettings();
        const apiBaseUrl = settings.server.url;

        if (!apiBaseUrl) {
            this.debugChannel.appendLine('[Definitions #' + reqId + '] No server URL configured');
            return null;
        }

        const url = apiBaseUrl + '/api/calcpad/definitions';

        const request: DefinitionsRequest = {
            content,
            clientFileCache
        };

        try {
            this.debugChannel.appendLine('[Definitions #' + reqId + '] Sending request to server...');
            const response = await axios.post<DefinitionsResponse>(
                url,
                request,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );

            this.debugChannel.appendLine('[Definitions #' + reqId + '] Server response: ' + JSON.stringify(response.data));
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNREFUSED') {
                    this.debugChannel.appendLine('[Definitions #' + reqId + '] Server connection refused');
                } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                    this.debugChannel.appendLine('[Definitions #' + reqId + '] Request timed out');
                } else {
                    this.debugChannel.appendLine('[Definitions #' + reqId + '] API error: ' + error.message);
                }
            } else {
                this.debugChannel.appendLine('[Definitions #' + reqId + '] Unknown error: ' + String(error));
            }
            return null;
        }
    }
}
