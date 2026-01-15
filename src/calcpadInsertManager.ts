import * as vscode from 'vscode';
import axios from 'axios';
import { CalcpadSettingsManager } from './calcpadSettings';

// API response types matching the server schema
export interface SnippetParameterDto {
    name: string;
    description?: string;
}

export interface SnippetDto {
    insert: string;
    description: string;
    label?: string;
    category: string;
    parameters?: SnippetParameterDto[];
}

export interface SnippetsResponse {
    count: number;
    snippets: SnippetDto[];
}

// Internal InsertItem used throughout the extension
export interface InsertItem {
    tag: string;
    label?: string;
    description: string;
    categoryPath?: string;
    parameters?: SnippetParameterDto[];
}

// Hierarchical structure for tree view
export interface InsertDataTree {
    [category: string]: InsertDataTree | InsertItem[];
}

export type SnippetsLoadedCallback = () => void;

export class CalcpadInsertManager {
    private static instance: CalcpadInsertManager;
    private _allItems: InsertItem[] = [];
    private _insertDataTree: InsertDataTree = {};
    private _isLoaded: boolean = false;
    private _loadPromise: Promise<void> | null = null;
    private _outputChannel: vscode.OutputChannel | null = null;
    private _settingsManager: CalcpadSettingsManager | null = null;
    private _retryInterval: ReturnType<typeof setInterval> | null = null;
    private _onSnippetsLoadedCallbacks: SnippetsLoadedCallback[] = [];
    private static readonly RETRY_INTERVAL_MS = 3000;

    private constructor() {}

    public static getInstance(): CalcpadInsertManager {
        if (!CalcpadInsertManager.instance) {
            CalcpadInsertManager.instance = new CalcpadInsertManager();
        }
        return CalcpadInsertManager.instance;
    }

    public setOutputChannel(outputChannel: vscode.OutputChannel): void {
        this._outputChannel = outputChannel;
    }

    public setSettingsManager(settingsManager: CalcpadSettingsManager): void {
        this._settingsManager = settingsManager;
    }

    private log(message: string): void {
        if (this._outputChannel) {
            this._outputChannel.appendLine('[SNIPPETS] ' + message);
        }
    }

    /**
     * Load snippets from the server. Safe to call multiple times - will reuse existing promise.
     * Starts background retry if initial load fails.
     */
    public async loadSnippets(): Promise<void> {
        if (this._isLoaded) {
            return;
        }

        if (this._loadPromise) {
            return this._loadPromise;
        }

        this._loadPromise = this.fetchSnippetsFromServer();

        try {
            await this._loadPromise;
        } catch {
            // Start background retry if not already running
            this.startRetryInterval();
        }
    }

    private startRetryInterval(): void {
        if (this._retryInterval) {
            return; // Already retrying
        }

        this.log('Starting background retry every ' + CalcpadInsertManager.RETRY_INTERVAL_MS + 'ms');

        this._retryInterval = setInterval(async () => {
            if (this._isLoaded) {
                this.stopRetryInterval();
                return;
            }

            this.log('Retrying snippet fetch...');
            this._loadPromise = null; // Reset so we can try again

            try {
                await this.fetchSnippetsFromServer();
                this.log('Retry successful - snippets loaded');
                this.stopRetryInterval();
            } catch {
                // Will retry on next interval
            }
        }, CalcpadInsertManager.RETRY_INTERVAL_MS);
    }

    private stopRetryInterval(): void {
        if (this._retryInterval) {
            clearInterval(this._retryInterval);
            this._retryInterval = null;
            this.log('Stopped background retry');
        }
    }

    private async fetchSnippetsFromServer(): Promise<void> {
        try {
            if (!this._settingsManager) {
                throw new Error('Settings manager not configured');
            }
            const settings = this._settingsManager.getSettings();
            const apiUrl = settings.server.url;
            const snippetsUrl = apiUrl + '/api/calcpad/snippets';

            this.log('Fetching snippets from: ' + snippetsUrl);

            const response = await axios.get<SnippetsResponse>(snippetsUrl);
            const { count, snippets } = response.data;

            this.log('Received ' + count + ' snippets from server');

            // Convert SnippetDto to InsertItem and build tree structure
            this._allItems = snippets.map(snippet => this.convertSnippetToInsertItem(snippet));
            this._insertDataTree = this.buildTreeFromSnippets(snippets);
            this._isLoaded = true;

            this.log('Snippets loaded and cached successfully');

            // Notify all listeners that snippets have been loaded
            this.notifySnippetsLoaded();
        } catch (error) {
            this.log('Failed to load snippets: ' + (error instanceof Error ? error.message : String(error)));
            // Reset promise so it can be retried
            this._loadPromise = null;
            throw error;
        }
    }

    /**
     * Register a callback to be called when snippets are loaded
     */
    public onSnippetsLoaded(callback: SnippetsLoadedCallback): void {
        this._onSnippetsLoadedCallbacks.push(callback);
    }

    /**
     * Notify all registered callbacks that snippets have been loaded
     */
    private notifySnippetsLoaded(): void {
        this.log('Notifying ' + this._onSnippetsLoadedCallbacks.length + ' listeners that snippets loaded');
        for (const callback of this._onSnippetsLoadedCallbacks) {
            try {
                callback();
            } catch (error) {
                this.log('Error in snippets loaded callback: ' + (error instanceof Error ? error.message : String(error)));
            }
        }
    }

    /**
     * Dispose of resources (stop retry interval)
     */
    public dispose(): void {
        this.stopRetryInterval();
    }

    private convertSnippetToInsertItem(snippet: SnippetDto): InsertItem {
        return {
            tag: snippet.insert,
            label: snippet.label,
            description: snippet.description,
            categoryPath: snippet.category.replace(/\//g, ' > '),
            parameters: snippet.parameters
        };
    }

    private buildTreeFromSnippets(snippets: SnippetDto[]): InsertDataTree {
        const tree: InsertDataTree = {};

        for (const snippet of snippets) {
            const parts = snippet.category.split('/');
            let current: InsertDataTree = tree;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;

                if (isLast) {
                    // Leaf category - add the item to an array
                    if (!current[part]) {
                        current[part] = [];
                    }
                    const items = current[part];
                    if (Array.isArray(items)) {
                        items.push(this.convertSnippetToInsertItem(snippet));
                    }
                } else {
                    // Intermediate category - ensure it's an object
                    if (!current[part]) {
                        current[part] = {};
                    }
                    const next = current[part];
                    if (!Array.isArray(next)) {
                        current = next;
                    }
                }
            }
        }

        return tree;
    }

    public isLoaded(): boolean {
        return this._isLoaded;
    }

    public getAllItems(): InsertItem[] {
        return [...this._allItems];
    }

    public getInsertData(): InsertDataTree {
        return this._insertDataTree;
    }

    public searchItems(searchTerm: string): InsertItem[] {
        if (!searchTerm.trim()) {
            return [];
        }

        const term = searchTerm.toLowerCase();

        // First priority: exact matches in item names (label, tag, description)
        const itemMatches = this._allItems.filter(item =>
            item.label?.toLowerCase().includes(term) ||
            item.tag?.toLowerCase().includes(term) ||
            item.description?.toLowerCase().includes(term)
        );

        // Second priority: matches in category paths (but not already in itemMatches)
        const categoryMatches = this._allItems.filter(item =>
            item.categoryPath?.toLowerCase().includes(term) &&
            !itemMatches.includes(item)
        );

        // Combine results: item matches first, then category matches
        return [...itemMatches, ...categoryMatches];
    }

    /**
     * Force reload snippets from server
     */
    public async reloadSnippets(): Promise<void> {
        this._isLoaded = false;
        this._loadPromise = null;
        this._allItems = [];
        this._insertDataTree = {};
        return this.loadSnippets();
    }
}