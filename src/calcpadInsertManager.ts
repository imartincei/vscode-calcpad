import * as vscode from 'vscode';
import insertData from './insertLoader';

export interface InsertItem {
    tag: string;
    label?: string;
    description: string;
    categoryPath?: string;
}

export class CalcpadInsertManager {
    private static instance: CalcpadInsertManager;
    private _allItems: InsertItem[] = [];

    private constructor() {
        this.initializeItems();
    }

    public static getInstance(): CalcpadInsertManager {
        if (!CalcpadInsertManager.instance) {
            CalcpadInsertManager.instance = new CalcpadInsertManager();
        }
        return CalcpadInsertManager.instance;
    }

    private initializeItems(): void {
        this._allItems = [];
        this.flattenItems(insertData, [], this._allItems);
    }

    private flattenItems(data: unknown, currentPath: string[], result: InsertItem[]): void {
        if (typeof data !== 'object' || data === null) return;

        Object.keys(data).forEach(categoryKey => {
            const categoryData = (data as Record<string, unknown>)[categoryKey];
            const newPath = [...currentPath, categoryKey];
            
            if (Array.isArray(categoryData)) {
                // This is a leaf category with items
                categoryData.forEach(item => {
                    if (this.isInsertItem(item)) {
                        result.push({
                            ...item,
                            categoryPath: newPath.join(' > ')
                        });
                    }
                });
            } else if (typeof categoryData === 'object' && categoryData !== null) {
                // Check if this object contains direct items
                const directItems = (categoryData as Record<string, unknown>).direct;
                if (Array.isArray(directItems)) {
                    directItems.forEach(item => {
                        if (this.isInsertItem(item)) {
                            result.push({
                                ...item,
                                categoryPath: newPath.join(' > ')
                            });
                        }
                    });
                }
                
                // Recursively process nested categories
                Object.keys(categoryData).forEach(subKey => {
                    if (subKey !== 'direct') {
                        const subData = { [subKey]: (categoryData as Record<string, unknown>)[subKey] };
                        this.flattenItems(subData, newPath, result);
                    }
                });
            }
        });
    }

    private isInsertItem(item: unknown): item is InsertItem {
        return typeof item === 'object' && 
               item !== null && 
               'tag' in item && 
               'description' in item &&
               typeof (item as InsertItem).tag === 'string' &&
               typeof (item as InsertItem).description === 'string';
    }

    public getAllItems(): InsertItem[] {
        return [...this._allItems];
    }

    public getInsertData(): unknown {
        return insertData;
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
}