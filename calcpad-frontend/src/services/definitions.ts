import type { CalcpadApiClient } from '../api/client';
import type { DefinitionsResponse, ClientFileCache } from '../types/api';
import type { ILogger } from '../types/interfaces';

/**
 * Service for fetching and caching definitions from the Calcpad server.
 * Provides macros, functions, variables, and custom units.
 */
export class CalcpadDefinitionsService {
    private apiClient: CalcpadApiClient;
    private logger?: ILogger;
    private requestId = 0;

    // Cache definitions per document key (URI in VS Code, file path in Electron)
    private cache = new Map<string, DefinitionsResponse>();

    constructor(apiClient: CalcpadApiClient, logger?: ILogger) {
        this.apiClient = apiClient;
        this.logger = logger;
    }

    /**
     * Get definitions from cache if available.
     */
    public getCachedDefinitions(documentKey: string): DefinitionsResponse | undefined {
        return this.cache.get(documentKey);
    }

    /**
     * Fetch definitions from the server and update the cache.
     * Takes content string directly (not a VS Code TextDocument).
     */
    public async refreshDefinitions(
        content: string,
        documentKey: string,
        clientFileCache?: ClientFileCache
    ): Promise<DefinitionsResponse | null> {
        const reqId = ++this.requestId;
        const startTime = Date.now();

        this.logger?.appendLine(`[Definitions #${reqId}] Request started (${content.length} chars)`);

        if (!content.trim()) {
            this.logger?.appendLine(`[Definitions #${reqId}] Skipped - empty content`);
            this.cache.delete(documentKey);
            return null;
        }

        const definitions = await this.apiClient.definitions(content, clientFileCache);

        if (definitions) {
            this.cache.set(documentKey, definitions);
            this.logger?.appendLine(
                `[Definitions #${reqId}] Cached ${definitions.macros.length} macros, ` +
                `${definitions.functions.length} functions, ` +
                `${definitions.variables.length} variables, ` +
                `${definitions.customUnits.length} custom units in ${Date.now() - startTime}ms`
            );
        } else {
            this.logger?.appendLine(`[Definitions #${reqId}] No definitions returned after ${Date.now() - startTime}ms`);
        }

        return definitions;
    }

    /**
     * Clear cache for a specific document or all documents.
     */
    public clearCache(documentKey?: string): void {
        if (documentKey) {
            this.cache.delete(documentKey);
        } else {
            this.cache.clear();
        }
    }
}
