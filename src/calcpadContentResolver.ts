import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CalcpadSettingsManager } from './calcpadSettings';
import { VariableDefinition, FunctionDefinition, CustomUnitDefinition } from './types/calcpad';

// Interface for macro definition
export interface MacroDefinition {
    name: string;
    params: string[];
    content: string[];
    lineNumber: number;
    source: 'local' | 'include';
    sourceFile?: string;
}

// Interface for resolved content result
export interface ResolvedContent {
    expandedLines: string[];
    sourceMap: Map<number, number>;
    macroExpansionLines: Map<number, string>;
    lineContinuationMap: Map<number, number[]>;
    userDefinedFunctions: Map<string, number>;
    functionsWithParams: Array<{name: string, params: string[]}> | FunctionDefinition[];
    userDefinedMacros: Map<string, {lineNumber: number, paramCount: number}>;
    definedVariables: Set<string>;
    variablesWithDefinitions: Array<{name: string, definition: string}> | VariableDefinition[];
    customUnits: CustomUnitDefinition[];
    allMacros: MacroDefinition[];
    duplicateMacros: Array<{name: string, duplicateLineNumber: number, originalLineNumber: number}>;
}

// Interface for staged content resolution
export interface StagedResolvedContent {
    stage1: {
        lines: string[];
        sourceMap: Map<number, number>;
        lineContinuationMap: Map<number, number[]>;
    };
    stage2: {
        lines: string[];
        sourceMap: Map<number, number>;
        includeMap: Map<number, {source: 'local' | 'include', sourceFile?: string}>;
        macroDefinitions: MacroDefinition[];
        duplicateMacros: Array<{name: string, duplicateLineNumber: number, originalLineNumber: number}>;
    };
    stage3: {
        lines: string[];
        sourceMap: Map<number, number>;
        macroExpansionLines: Map<number, string>;
        userDefinedFunctions: Map<string, number>;
        functionsWithParams: FunctionDefinition[];
        userDefinedMacros: Map<string, {lineNumber: number, paramCount: number}>;
        definedVariables: Set<string>;
        variablesWithDefinitions: VariableDefinition[];
        customUnits: CustomUnitDefinition[];
    };
}

export class CalcpadContentResolver {
    private contentCache: Map<string, string[]> = new Map();
    private outputChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;

    constructor(settingsManager: CalcpadSettingsManager, outputChannel: vscode.OutputChannel) {
        this.settingsManager = settingsManager;
        this.outputChannel = outputChannel;
    }

    // Get cached content for an include file (used by server linter)
    public getCachedContent(fileName: string): string[] | undefined {
        return this.contentCache.get(fileName);
    }

    // Pre-cache all include content asynchronously
    public async preCacheContent(lines: string[]): Promise<void> {
        const includeUrls = new Set<string>();
        
        // Find all include operations
        for (const line of lines) {
            const includeMatch = /#include\s+([^\s]+)/.exec(line);
            // !!! Add logic to check if #include is local or based on URL and handle it accordingly
            if (includeMatch) {
                const fileName = includeMatch[1].replace(/['"]/g, '');
                includeUrls.add(fileName);
            }
        }
        
        // Cache content for each unique file
        for (const fileName of includeUrls) {
            if (!this.contentCache.has(fileName)) {
                try {
                    this.outputChannel.appendLine(`[DEBUG] Pre-caching content from S3: ${fileName}`);
                    const content = await this.fetchFileFromS3(fileName);
                    const lines = content.split('\n').filter(line => line.trim() !== '');
                    this.contentCache.set(fileName, lines);
                    this.outputChannel.appendLine(`[DEBUG] Cached ${lines.length} lines for ${fileName}`);
                } catch (error) {
                    this.outputChannel.appendLine(`[DEBUG] Failed to cache ${fileName}: ${error}`);
                    this.contentCache.set(fileName, [`' Error fetching: ${fileName} - ${error}`]);
                }
            }
        }
    }

    // Fetch file from S3 using the loginUrl for VS Code requests
    private async fetchFileFromS3(fileName: string): Promise<string> {
        const fullSettings = await this.settingsManager.getSettings();
        const apiSettings = await this.settingsManager.getApiSettings() as {
            auth: { jwt: string; url: string }
        };
        const jwt = apiSettings.auth.jwt;
        const baseUrl = apiSettings.auth.url;
        
        if (!jwt) {
            throw new Error('No JWT token available for S3 authentication');
        }
        
        const encodedFileName = encodeURIComponent(fileName);
        const requestUrl = `${baseUrl}/api/blobstorage/download/${encodedFileName}`;
        
        this.outputChannel.appendLine(`[DEBUG] Fetching from: ${requestUrl}`);
        
        const response = await fetch(requestUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'User-Agent': 'Calcpad-VSCode/1.0',
                'Accept': '*/*'
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText} | Response: ${responseText}`);
        }
        
        return await response.text();
    }

    // Get compiled/resolved content with all macros
    public getCompiledContent(document: vscode.TextDocument): ResolvedContent {
        const text = document.getText();
        const lines = text.split('\n');

        // Process line continuations first
        const { processedLines, lineContinuationMap } = this.processLineContinuations(lines);
        
        // Check if we need complex content resolution
        const needsComplexResolution = this.needsComplexResolution(processedLines);
        
        this.outputChannel.appendLine(`[DEBUG] needsComplexResolution: ${needsComplexResolution}`);
        
        if (!needsComplexResolution) {
            // Simple case: no includes or complex macros
            const sourceMap = new Map<number, number>();
            processedLines.forEach((_, index) => sourceMap.set(index, index));

            // Create lineSourceMap for simple case (all lines are local)
            const lineSourceMap = new Map<number, {source: 'local' | 'include', sourceFile?: string}>();
            for (let i = 0; i < processedLines.length; i++) {
                lineSourceMap.set(i, {source: 'local'});
            }

            // Collect with source tracking (single pass for both simple and rich data)
            const variablesWithSourceInfo = this.collectDefinedVariablesWithValues(processedLines, lineSourceMap) as VariableDefinition[];
            const functionsWithDefinitions = this.collectUserDefinedFunctionsWithParams(processedLines, lineSourceMap) as FunctionDefinition[];

            return {
                expandedLines: processedLines,
                sourceMap,
                macroExpansionLines: new Map(),
                lineContinuationMap,
                userDefinedFunctions: this.collectUserDefinedFunctions(processedLines),
                functionsWithParams: functionsWithDefinitions.map(f => ({name: f.name, params: f.params})),
                userDefinedMacros: this.collectUserDefinedMacros(processedLines),
                definedVariables: this.collectDefinedVariables(processedLines),
                variablesWithDefinitions: variablesWithSourceInfo.map(v => ({name: v.name, definition: v.definition})),
                customUnits: this.collectCustomUnits(processedLines, lineSourceMap),
                allMacros: this.collectAllMacroDefinitions(processedLines, 'local'),
                duplicateMacros: [] // No duplicates in simple case
            };
        }

        // Complex resolution with includes and macro expansions
        return this.performComplexResolution(processedLines, lineContinuationMap);
    }

    // Process line continuations
    private processLineContinuations(lines: string[]): { processedLines: string[], lineContinuationMap: Map<number, number[]> } {
        const processedLines: string[] = [];
        const lineContinuationMap = new Map<number, number[]>();
        
        this.outputChannel.appendLine(`[DEBUG] Line continuation processing:`);
        this.outputChannel.appendLine(`  Original lines: ${lines.length}, Processed lines: ${processedLines.length}`);
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            
            // Check if this line ends with continuation pattern: whitespace + _ + whitespace + end
            const continuationMatch = /^(.*)(\s+_\s*)$/.exec(line);
            if (continuationMatch && i < lines.length - 1) {
                // This line continues to the next
                const baseContent = continuationMatch[1]; // Content before the _
                const continuedLines = [i]; // Track original line numbers that make up this continued line
                let fullLine = baseContent;
                
                // Collect all continuation lines
                let j = i + 1;
                while (j < lines.length) {
                    const nextLine = lines[j];
                    continuedLines.push(j);
                    
                    // Check if next line also has continuation
                    const nextContinuationMatch = /^(.*)(\s+_\s*)$/.exec(nextLine);
                    if (nextContinuationMatch && j < lines.length - 1) {
                        // Next line also continues
                        fullLine += nextContinuationMatch[1];
                        j++;
                    } else {
                        // Last line in continuation
                        fullLine += nextLine;
                        break;
                    }
                }
                
                processedLines.push(fullLine);
                lineContinuationMap.set(processedLines.length - 1, continuedLines);
                i = j + 1; // Skip past all processed continuation lines
            } else {
                // Regular line (no continuation)
                processedLines.push(line);
                i++;
            }
        }
        
        this.outputChannel.appendLine(`  Original lines: ${lines.length}, Processed lines: ${processedLines.length}`);
        return { processedLines, lineContinuationMap };
    }

    // Check if we need complex resolution
    private needsComplexResolution(lines: string[]): boolean {
        for (const line of lines) {
            if (line.includes('#include ') || line.includes('#def ') || line.includes('#end def')) {
                return true;
            }
        }
        return false;
    }

    // Perform complex resolution with includes and macro expansions
    private performComplexResolution(lines: string[], lineContinuationMap: Map<number, number[]>): ResolvedContent {
        const expandedLines: string[] = [];
        const sourceMap = new Map<number, number>();
        const macroExpansionLines = new Map<number, string>();
        const lineSourceMap = new Map<number, {source: 'local' | 'include', sourceFile?: string}>();
        const macros = new Map<string, { params: string[], content: string[] }>();
        const allMacros: MacroDefinition[] = [];
        const duplicateMacros: Array<{name: string, duplicateLineNumber: number, originalLineNumber: number}> = [];
        const macroFirstDefinitions = new Map<string, number>(); // Track first definition line numbers

        this.outputChannel.appendLine(`[DEBUG] Using complex resolution for ${lines.length} lines`);

        // First pass: collect macros and resolve includes/fetch
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const originalLineNumber = i;
            
            // Handle macro definitions
            if (line.trim().startsWith('#def ')) {
                this.outputChannel.appendLine(`[DEBUG] Processing macro definition: "${line}"`);
                const macroDefinition = this.parseMacroDefinition(line.trim());
                if (macroDefinition) {
                    // Check for duplicate macro definition
                    if (macroFirstDefinitions.has(macroDefinition.name)) {
                        const originalLineNumber = macroFirstDefinitions.get(macroDefinition.name)!;
                        duplicateMacros.push({
                            name: macroDefinition.name,
                            duplicateLineNumber: i,
                            originalLineNumber: originalLineNumber
                        });
                        this.outputChannel.appendLine(`[DEBUG] Duplicate macro detected: ${macroDefinition.name} at line ${i}, originally defined at line ${originalLineNumber}`);
                    } else {
                        // First definition of this macro
                        macroFirstDefinitions.set(macroDefinition.name, i);
                        this.outputChannel.appendLine(`[DEBUG] Storing ${macroDefinition.isInline ? 'inline' : 'multiline'} macro: ${macroDefinition.name}`);
                        macros.set(macroDefinition.name, {
                            params: macroDefinition.params,
                            content: macroDefinition.content
                        });
                    }
                    
                    // Add to all macros collection (including duplicates for tracking)
                    allMacros.push({
                        name: macroDefinition.name,
                        params: macroDefinition.params,
                        content: macroDefinition.content,
                        lineNumber: originalLineNumber,
                        source: 'local'
                    });
                }
                
                // Add all macro definitions (both inline and multiline) to expanded output for linting
                expandedLines.push(line);
                sourceMap.set(expandedLines.length - 1, originalLineNumber);
                
                if (macroDefinition?.isInline) {
                    continue; // Continue to next line after adding inline macro to output
                }
                // For multiline macros, also continue (definition line is already added above)
                continue;
            }

            // Handle include operations
            if (line.startsWith('#include ')) {
                this.outputChannel.appendLine(`[DEBUG] Processing include: ${line}`);
                const includedLines = this.resolveInclude(line);
                const includeFile = line.replace('#include ', '').trim().replace(/['"]/g, '');
                this.outputChannel.appendLine(`[DEBUG] Include resolved to ${includedLines.length} lines`);

                // Check for duplicate macros in included content
                this.checkDuplicateMacros(includedLines, macroFirstDefinitions, duplicateMacros, expandedLines.length);

                // Collect macros from included content
                const includedMacros = this.collectAllMacroDefinitions(includedLines, 'include', includeFile);
                allMacros.push(...includedMacros);

                for (const includedLine of includedLines) {
                    expandedLines.push(includedLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
                    lineSourceMap.set(expandedLines.length - 1, {
                        source: 'include',
                        sourceFile: includeFile
                    });
                }
                continue;
            }

            // Expand macros in regular lines
            if (expandedLines.length === 0) {
                this.outputChannel.appendLine(`[DEBUG] Final macro map before expansion:`);
                for (const [name, macro] of macros.entries()) {
                    this.outputChannel.appendLine(`  ${name}: params=[${macro.params.join(', ')}], content=[${macro.content.join(' | ')}]`);
                }
            }
            let expandedLine = this.expandMacros(lines[i], macros);
            const isFromMacroExpansion = expandedLine !== lines[i];

            // Handle multiline expansions
            if (expandedLine.includes('\n')) {
                const expandedSubLines = expandedLine.split('\n');
                for (const subLine of expandedSubLines) {
                    expandedLines.push(subLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
                    lineSourceMap.set(expandedLines.length - 1, {source: 'local'});
                    // Mark lines that came from macro expansions
                    if (isFromMacroExpansion) {
                        macroExpansionLines.set(expandedLines.length - 1, lines[i]);
                    }
                }
            } else {
                expandedLines.push(expandedLine);
                sourceMap.set(expandedLines.length - 1, originalLineNumber);
                lineSourceMap.set(expandedLines.length - 1, {source: 'local'});
                // Mark lines that came from macro expansions
                if (isFromMacroExpansion) {
                    macroExpansionLines.set(expandedLines.length - 1, lines[i]);
                }
            }
        }

        // Log final expansion result
        this.outputChannel.appendLine(`[DEBUG] Expanded to ${expandedLines.length} lines:`);
        expandedLines.forEach((line, index) => {
            this.outputChannel.appendLine(`  [${index}]: ${line}`);
        });

        // Collect definitions from resolved content
        const userDefinedFunctions = this.collectUserDefinedFunctions(expandedLines);
        const userDefinedMacros = this.collectUserDefinedMacros(expandedLines);
        const definedVariables = this.collectDefinedVariables(expandedLines);

        // Collect with source tracking (single pass for both simple and rich data)
        const variablesWithSourceInfo = this.collectDefinedVariablesWithValues(expandedLines, lineSourceMap) as VariableDefinition[];
        const functionsWithDefinitions = this.collectUserDefinedFunctionsWithParams(expandedLines, lineSourceMap) as FunctionDefinition[];

        return {
            expandedLines,
            sourceMap,
            macroExpansionLines,
            lineContinuationMap,
            userDefinedFunctions,
            functionsWithParams: functionsWithDefinitions.map(f => ({name: f.name, params: f.params})),
            userDefinedMacros,
            definedVariables,
            variablesWithDefinitions: variablesWithSourceInfo.map(v => ({name: v.name, definition: v.definition})),
            customUnits: this.collectCustomUnits(expandedLines, lineSourceMap),
            allMacros,
            duplicateMacros
        };
    }

    // Collect all macro definitions with source information
    private collectAllMacroDefinitions(lines: string[], source: 'local' | 'include', sourceFile?: string): MacroDefinition[] {
        const macros: MacroDefinition[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('#def ')) {
                const macroDefinition = this.parseMacroDefinition(line.trim());
                if (macroDefinition) {
                    macros.push({
                        name: macroDefinition.name,
                        params: macroDefinition.params,
                        content: macroDefinition.content,
                        lineNumber: i,
                        source,
                        sourceFile
                    });
                }
            }
        }
        
        return macros;
    }

    // Parse macro definition
    private parseMacroDefinition(line: string): { name: string, params: string[], content: string[], isInline: boolean } | null {
        this.outputChannel.appendLine(`[DEBUG] parseMacroDefinition: "${line}"`);
        
        // Pattern for inline macros: #def macroName(params) = content
        const inlinePattern = /#def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\(\s*([^)]*)\s*\))?\s*=\s*(.+)/;
        const inlineMatch = inlinePattern.exec(line);
        
        if (inlineMatch) {
            const name = inlineMatch[1];
            const paramsStr = inlineMatch[2] || '';
            const content = inlineMatch[3];
            const params = paramsStr ? paramsStr.split(';').map(p => p.trim()).filter(p => p) : [];
            
            this.outputChannel.appendLine(`[DEBUG] Parsed inline macro: name="${name}", params=[${params.join(', ')}], content="${content}"`);
            return {
                name,
                params,
                content: [content],
                isInline: true
            };
        }
        
        // Pattern for multiline macros: #def macroName(params)
        const multilinePattern = /#def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\(\s*([^)]*)\s*\))?/;
        const multilineMatch = multilinePattern.exec(line);
        
        if (multilineMatch) {
            const name = multilineMatch[1];
            const paramsStr = multilineMatch[2] || '';
            const params = paramsStr ? paramsStr.split(';').map(p => p.trim()).filter(p => p) : [];
            
            this.outputChannel.appendLine(`[DEBUG] Parsed multiline macro: name="${name}", params=[${params.join(', ')}]`);
            return {
                name,
                params,
                content: [], // Content will be collected separately for multiline macros
                isInline: false
            };
        }
        
        return null;
    }

    // Rest of the methods remain the same as in the original linter

    private resolveInclude(line: string): string[] {
        const includePattern = /#include\s+([^\s]+)/;
        const match = includePattern.exec(line);
        if (!match) {
            return [`' Invalid include: ${line}`];
        }

        const filename = match[1].replace(/['"]/g, '');
        
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.resolve(filename);
            
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                return content.split('\n').filter((line: string) => line.trim() !== '');
            } else {
                return [`' File not found: ${filename}`];
            }
        } catch (error) {
            return [`' Error reading include file: ${filename}`];
        }
    }
    // !!! Merge these functions into a single one that uses updated #include syntax
    private resolveFetch(line: string): string[] {
        const fetchPattern = /#fetch\s+([^\s]+)/;
        const match = fetchPattern.exec(line);
        if (!match) {
            return [`' Invalid fetch: ${line}`];
        }

        const fileName = match[1].replace(/['"]/g, '');
        
        // Return cached content if available
        if (this.contentCache.has(fileName)) {
            const cachedContent = this.contentCache.get(fileName)!;
            this.outputChannel.appendLine(`[DEBUG] Using cached content for ${fileName}: ${cachedContent.length} lines`);
            return cachedContent;
        }
        
        // If not cached, return error message
        return [`' Content not cached for: ${fileName} (run preCacheContent first)`];
    }

    private expandMacros(line: string, macros: Map<string, { params: string[], content: string[] }>): string {
        let expandedLine = line;
        this.outputChannel.appendLine(`[DEBUG] expandMacros input: "${line}"`);
        this.outputChannel.appendLine(`[DEBUG] Available macros: ${Array.from(macros.keys()).join(', ')}`);

        // Only try to expand known macros - check each defined macro to see if it's called in this line
        for (const [macroName, macro] of macros.entries()) {
            // Look for macro calls: macroName or macroName(args)
            const escapedMacroName = macroName.replace(/\$/g, '\\$');
            const macroCallPattern = new RegExp(`\\b${escapedMacroName}\\s*(?:\\(\\s*([^)]*)\\s*\\))?`, 'g');
            
            expandedLine = expandedLine.replace(macroCallPattern, (match, args) => {
                this.outputChannel.appendLine(`[DEBUG] Found macro call: ${match}, macro: ${macroName}, params: ${args || 'none'}`);
                
                const argList = args ? args.split(';').map((arg: string) => arg.trim()) : [];
                
                if (macro.params.length === argList.length) {
                    let macroContent = macro.content.join('\n');
                    this.outputChannel.appendLine(`[DEBUG] Macro content before substitution: ${macroContent}`);
                    
                    // Substitute parameters
                    for (let i = 0; i < macro.params.length; i++) {
                        const paramName = macro.params[i];
                        const argValue = argList[i];
                        const escapedParamName = paramName.replace(/\$/g, '\\$');
                        macroContent = macroContent.replace(new RegExp(`\\b${escapedParamName}\\b`, 'g'), argValue);
                    }
                    
                    this.outputChannel.appendLine(`[DEBUG] Final expanded content: ${macroContent}`);
                    return macroContent;
                } else {
                    this.outputChannel.appendLine(`[DEBUG] Parameter count mismatch for ${macroName}: expected ${macro.params.length}, got ${argList.length}`);
                    return match; // Return original if parameter count doesn't match
                }
            });
        }

        this.outputChannel.appendLine(`[DEBUG] expandMacros output: "${expandedLine}"`);
        return expandedLine;
    }

    private collectUserDefinedFunctions(lines: string[]): Map<string, number> {
        const userFunctions = new Map<string, number>();
        
        for (const line of lines) {
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"')) {
                continue;
            }
            
            // Check for function definitions: functionName(params) = expression
            const functionPattern = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*([^)]*)\s*\)\s*=\s*(.+)/;
            const match = functionPattern.exec(line.trim());
            if (match) {
                const funcName = match[1];
                const params = match[2];
                const paramCount = params.trim() === '' ? 0 : params.split(';').length;
                userFunctions.set(funcName, paramCount);
            }
        }
        
        return userFunctions;
    }

    private collectUserDefinedFunctionsWithParams(
        lines: string[],
        lineSourceMap?: Map<number, {source: 'local' | 'include', sourceFile?: string}>
    ): Array<{name: string, params: string[]}> | FunctionDefinition[] {
        const userFunctions: unknown[] = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"')) {
                continue;
            }

            // Check for function definitions: functionName(params) = expression
            const functionPattern = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*([^)]*)\s*\)\s*=\s*(.+)/;
            const match = functionPattern.exec(line.trim());
            if (match) {
                const funcName = match[1];
                const paramsStr = match[2];
                const params = paramsStr.trim() === '' ? [] : paramsStr.split(';').map(p => p.trim());

                if (lineSourceMap) {
                    // Return with source info
                    const sourceInfo = lineSourceMap.get(lineIndex) || {source: 'local' as const};
                    userFunctions.push({
                        name: funcName,
                        params: params,
                        lineNumber: lineIndex,
                        source: sourceInfo.source,
                        sourceFile: sourceInfo.sourceFile
                    });
                } else {
                    // Return simple object (backward compatible)
                    userFunctions.push({name: funcName, params: params});
                }
            }
        }

        return userFunctions as Array<{name: string, params: string[]}> | FunctionDefinition[];
    }

    private collectUserDefinedMacros(lines: string[]): Map<string, {lineNumber: number, paramCount: number}> {
        const userMacros = new Map<string, {lineNumber: number, paramCount: number}>();
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"')) {
                continue;
            }
            
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('#def ')) {
                continue;
            }

            const macroDefinition = this.parseMacroDefinition(trimmedLine);
            if (macroDefinition) {
                userMacros.set(macroDefinition.name, {
                    lineNumber: lineIndex,
                    paramCount: macroDefinition.params.length
                });
            }
        }
        
        return userMacros;
    }

    private collectDefinedVariables(lines: string[]): Set<string> {
        const variables = new Set<string>();
        
        for (const line of lines) {
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"') || line.trim().startsWith('#')) {
                continue;
            }
            
            // Check for variable assignments: variableName = expression
            const variablePattern = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/;
            const match = variablePattern.exec(line.trim());
            if (match) {
                const varName = match[1];
                // Skip if it's a function definition (has parentheses)
                if (!line.includes('(') || line.indexOf('(') > line.indexOf('=')) {
                    variables.add(varName);
                    this.outputChannel.appendLine(`[DEBUG] Collected variable: ${varName} from line: "${line}"`);
                }
            }
        }
        
        this.outputChannel.appendLine(`[DEBUG] Total variables collected: [${Array.from(variables).join(', ')}]`);
        return variables;
    }

    private collectDefinedVariablesWithValues(
        lines: string[],
        lineSourceMap?: Map<number, {source: 'local' | 'include', sourceFile?: string}>
    ): Array<{name: string, definition: string}> | VariableDefinition[] {
        const variables: unknown[] = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"') || line.trim().startsWith('#')) {
                continue;
            }

            // Check for variable assignments: variableName = expression
            const variablePattern = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.+)/;
            const match = variablePattern.exec(line.trim());
            if (match) {
                const varName = match[1];
                const definition = match[2].replace(/\s*'.*$/, '').trim(); // Remove comments
                // Skip if it's a function definition (has parentheses)
                if (!line.includes('(') || line.indexOf('(') > line.indexOf('=')) {
                    if (lineSourceMap) {
                        // Return with source info
                        const sourceInfo = lineSourceMap.get(lineIndex) || {source: 'local' as const};
                        variables.push({
                            name: varName,
                            definition: definition,
                            lineNumber: lineIndex,
                            source: sourceInfo.source,
                            sourceFile: sourceInfo.sourceFile
                        });
                    } else {
                        // Return simple object (backward compatible)
                        variables.push({name: varName, definition: definition});
                    }
                }
            }
        }

        return variables as Array<{name: string, definition: string}> | VariableDefinition[];
    }

    private collectCustomUnits(
        lines: string[],
        lineSourceMap?: Map<number, {source: 'local' | 'include', sourceFile?: string}>
    ): CustomUnitDefinition[] {
        const customUnits: CustomUnitDefinition[] = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"') || line.trim().startsWith('#')) {
                continue;
            }

            // Check for custom unit definitions: .unitName = expression
            const customUnitPattern = /^\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.+)/;
            const match = customUnitPattern.exec(line.trim());
            if (match) {
                const unitName = match[1]; // Without the dot
                const definition = match[2].replace(/\s*'.*$/, '').trim(); // Remove comments

                const sourceInfo = lineSourceMap?.get(lineIndex) || {source: 'local' as const};
                customUnits.push({
                    name: unitName,
                    definition: definition,
                    lineNumber: lineIndex,
                    source: sourceInfo.source,
                    sourceFile: sourceInfo.sourceFile
                });
            }
        }

        return customUnits;
    }

    // Helper function to check for duplicate macros in a set of lines
    private checkDuplicateMacros(lines: string[], macroFirstDefinitions: Map<string, number>, duplicateMacros: Array<{name: string, duplicateLineNumber: number, originalLineNumber: number}>, baseLineNumber: number) {
        for (let j = 0; j < lines.length; j++) {
            const line = lines[j];
            if (line.trim().startsWith('#def ')) {
                const macroDefinition = this.parseMacroDefinition(line.trim());
                if (macroDefinition) {
                    if (macroFirstDefinitions.has(macroDefinition.name)) {
                        const originalLineNumber = macroFirstDefinitions.get(macroDefinition.name)!;
                        duplicateMacros.push({
                            name: macroDefinition.name,
                            duplicateLineNumber: baseLineNumber + j,
                            originalLineNumber: originalLineNumber
                        });
                    } else {
                        macroFirstDefinitions.set(macroDefinition.name, baseLineNumber + j);
                    }
                }
            }
        }
    }

    // Get staged content with all three stages
    public getStagedContent(document: vscode.TextDocument): StagedResolvedContent {
        const text = document.getText();
        const lines = text.split('\n');

        // STAGE 1: Process line continuations only
        const stage1 = this.processStage1(lines);

        // STAGE 2: Resolve includes, collect macros (but don't expand)
        const stage2 = this.processStage2(stage1);

        // STAGE 3: Expand macros, collect all definitions
        const stage3 = this.processStage3(stage2);

        return { stage1, stage2, stage3 };
    }

    // STAGE 1: Process line continuations only
    private processStage1(lines: string[]): StagedResolvedContent['stage1'] {
        const { processedLines, lineContinuationMap } = this.processLineContinuations(lines);

        const sourceMap = new Map<number, number>();
        for (let i = 0; i < processedLines.length; i++) {
            const continuationOriginalLines = lineContinuationMap.get(i);
            if (continuationOriginalLines && continuationOriginalLines.length > 0) {
                sourceMap.set(i, continuationOriginalLines[0]);
            } else {
                sourceMap.set(i, i);
            }
        }

        return {
            lines: processedLines,
            sourceMap,
            lineContinuationMap
        };
    }

    // STAGE 2: Resolve includes, collect macros (don't expand)
    private processStage2(stage1: StagedResolvedContent['stage1']): StagedResolvedContent['stage2'] {
        const lines: string[] = [];
        const sourceMap = new Map<number, number>();
        const includeMap = new Map<number, {source: 'local' | 'include', sourceFile?: string}>();
        const macroDefinitions: MacroDefinition[] = [];
        const duplicateMacros: Array<{name: string, duplicateLineNumber: number, originalLineNumber: number}> = [];
        const macroFirstDefinitions = new Map<string, number>();

        for (let i = 0; i < stage1.lines.length; i++) {
            const line = stage1.lines[i];

            // Handle #include directives - expand but don't process macros
            if (line.trim().startsWith('#include ')) {
                const includedLines = this.resolveInclude(line);
                const includeFile = line.replace('#include ', '').trim().replace(/['"]/g, '');

                // Check for duplicate macros in included content
                for (let j = 0; j < includedLines.length; j++) {
                    const includedLine = includedLines[j];
                    if (includedLine.trim().startsWith('#def ')) {
                        const macroDefinition = this.parseMacroDefinition(includedLine.trim());
                        if (macroDefinition) {
                            if (macroFirstDefinitions.has(macroDefinition.name)) {
                                duplicateMacros.push({
                                    name: macroDefinition.name,
                                    duplicateLineNumber: lines.length + j,
                                    originalLineNumber: macroFirstDefinitions.get(macroDefinition.name)!
                                });
                            } else {
                                macroFirstDefinitions.set(macroDefinition.name, lines.length + j);
                            }

                            macroDefinitions.push({
                                name: macroDefinition.name,
                                params: macroDefinition.params,
                                content: macroDefinition.content,
                                lineNumber: lines.length + j,
                                source: 'include',
                                sourceFile: includeFile
                            });
                        }
                    }
                }

                for (const includedLine of includedLines) {
                    lines.push(includedLine);
                    sourceMap.set(lines.length - 1, i);
                    includeMap.set(lines.length - 1, {
                        source: 'include',
                        sourceFile: includeFile
                    });
                }
                continue;
            }

            // Track macro definitions (but don't expand them yet)
            if (line.trim().startsWith('#def ')) {
                const macroDefinition = this.parseMacroDefinition(line.trim());
                if (macroDefinition) {
                    // Check for duplicates
                    if (macroFirstDefinitions.has(macroDefinition.name)) {
                        duplicateMacros.push({
                            name: macroDefinition.name,
                            duplicateLineNumber: lines.length,
                            originalLineNumber: macroFirstDefinitions.get(macroDefinition.name)!
                        });
                    } else {
                        macroFirstDefinitions.set(macroDefinition.name, lines.length);
                    }

                    macroDefinitions.push({
                        name: macroDefinition.name,
                        params: macroDefinition.params,
                        content: macroDefinition.content,
                        lineNumber: lines.length,
                        source: 'local'
                    });
                }
            }

            // Add line as-is (macros not expanded yet)
            lines.push(line);
            sourceMap.set(lines.length - 1, i);
            includeMap.set(lines.length - 1, {source: 'local'});
        }

        return {
            lines,
            sourceMap,
            includeMap,
            macroDefinitions,
            duplicateMacros
        };
    }

    // STAGE 3: Expand macros, collect all definitions
    private processStage3(stage2: StagedResolvedContent['stage2']): StagedResolvedContent['stage3'] {
        const lines: string[] = [];
        const sourceMap = new Map<number, number>();
        const macroExpansionLines = new Map<number, string>();
        const macros = new Map<string, { params: string[], content: string[] }>();

        // Build macro map from stage2 definitions (skip duplicates, use first definition)
        for (const macroDef of stage2.macroDefinitions) {
            if (!macros.has(macroDef.name)) {
                macros.set(macroDef.name, {
                    params: macroDef.params,
                    content: macroDef.content
                });
            }
        }

        // Expand macros in all lines
        for (let i = 0; i < stage2.lines.length; i++) {
            const line = stage2.lines[i];
            const expandedLine = this.expandMacros(line, macros);
            const isFromMacroExpansion = expandedLine !== line;

            // Handle multiline expansions
            if (expandedLine.includes('\n')) {
                const expandedSubLines = expandedLine.split('\n');
                for (const subLine of expandedSubLines) {
                    lines.push(subLine);
                    sourceMap.set(lines.length - 1, i);
                    if (isFromMacroExpansion) {
                        macroExpansionLines.set(lines.length - 1, line);
                    }
                }
            } else {
                lines.push(expandedLine);
                sourceMap.set(lines.length - 1, i);
                if (isFromMacroExpansion) {
                    macroExpansionLines.set(lines.length - 1, line);
                }
            }
        }

        // Collect all definitions from expanded content
        const userDefinedFunctions = this.collectUserDefinedFunctions(lines);
        const functionsWithParams = this.collectUserDefinedFunctionsWithParams(lines, stage2.includeMap) as FunctionDefinition[];
        const userDefinedMacros = this.collectUserDefinedMacros(lines);
        const definedVariables = this.collectDefinedVariables(lines);
        const variablesWithDefinitions = this.collectDefinedVariablesWithValues(lines, stage2.includeMap) as VariableDefinition[];
        const customUnits = this.collectCustomUnits(lines, stage2.includeMap);

        return {
            lines,
            sourceMap,
            macroExpansionLines,
            userDefinedFunctions,
            functionsWithParams,
            userDefinedMacros,
            definedVariables,
            variablesWithDefinitions,
            customUnits
        };
    }
}