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

// Internal InsertItem used throughout the extension and desktop app
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
