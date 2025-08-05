// Types for Calcpad insert functionality

export interface InsertItem {
  label: string;
  description: string;
  tag: string; // The text to insert
  category: string;
  hasParameters?: boolean;
  example?: string;
}

export interface InsertCategory {
  name: string;
  icon: string;
  items: InsertItem[];
}

export interface InsertEvent {
  text: string;
  selectRange?: {
    start: number;
    end: number;
  };
}

export enum InsertType {
  CONSTANTS = 'constants',
  OPERATORS = 'operators',
  FUNCTIONS = 'functions',
  VECTORS = 'vectors',
  MATRICES = 'matrices',
  UNITS = 'units',
  TEMPLATES = 'templates'
}