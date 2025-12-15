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

// Variable definition with source tracking
export interface VariableDefinition {
  name: string;
  definition: string;
  lineNumber: number;
  source: 'local' | 'include';
  sourceFile?: string;
}

// Function definition with source tracking
export interface FunctionDefinition {
  name: string;
  params: string[];
  lineNumber: number;
  source: 'local' | 'include';
  sourceFile?: string;
}

// Custom unit definition with source tracking
export interface CustomUnitDefinition {
  name: string;              // Unit name WITHOUT the dot (e.g., "customUnit")
  definition: string;        // The value expression (e.g., "1in")
  lineNumber: number;
  source: 'local' | 'include';
  sourceFile?: string;
}

// Re-export StagedResolvedContent from calcpadContentResolver
export type { StagedResolvedContent } from '../calcpadContentResolver';