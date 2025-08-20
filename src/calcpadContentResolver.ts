import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CalcpadSettingsManager } from './calcpadSettings';

// Interface for macro definition
export interface MacroDefinition {
    name: string;
    params: string[];
    content: string[];
    lineNumber: number;
    source: 'local' | 'include' | 'fetch';
    sourceFile?: string;
}

// Interface for resolved content result
export interface ResolvedContent {
    expandedLines: string[];
    sourceMap: Map<number, number>;
    macroExpansionLines: Map<number, string>;
    lineContinuationMap: Map<number, number[]>;
    userDefinedFunctions: Map<string, number>;
    functionsWithParams: Array<{name: string, params: string[]}>;
    userDefinedMacros: Map<string, number>;
    definedVariables: Set<string>;
    variablesWithDefinitions: Array<{name: string, definition: string}>;
    allMacros: MacroDefinition[];
}

export class CalcpadContentResolver {
    private contentCache: Map<string, string[]> = new Map();
    private outputChannel: vscode.OutputChannel;
    private settingsManager: CalcpadSettingsManager;

    constructor(settingsManager: CalcpadSettingsManager, outputChannel: vscode.OutputChannel) {
        this.settingsManager = settingsManager;
        this.outputChannel = outputChannel;
    }

    // Pre-cache all fetch content asynchronously
    public async preCacheContent(lines: string[]): Promise<void> {
        const fetchUrls = new Set<string>();
        
        // Find all fetch operations
        for (const line of lines) {
            const fetchMatch = /#fetch\s+([^\s]+)/.exec(line);
            if (fetchMatch) {
                const fileName = fetchMatch[1].replace(/['"]/g, '');
                fetchUrls.add(fileName);
            }
        }
        
        // Cache content for each unique file
        for (const fileName of fetchUrls) {
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
        const baseUrl = fullSettings.auth.loginUrl;
        
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
            // Simple case: no includes, fetch, or complex macros
            const sourceMap = new Map<number, number>();
            processedLines.forEach((_, index) => sourceMap.set(index, index));
            
            return {
                expandedLines: processedLines,
                sourceMap,
                macroExpansionLines: new Map(),
                lineContinuationMap,
                userDefinedFunctions: this.collectUserDefinedFunctions(processedLines),
                functionsWithParams: this.collectUserDefinedFunctionsWithParams(processedLines),
                userDefinedMacros: this.collectUserDefinedMacros(processedLines),
                definedVariables: this.collectDefinedVariables(processedLines),
                variablesWithDefinitions: this.collectDefinedVariablesWithValues(processedLines),
                allMacros: this.collectAllMacroDefinitions(processedLines, 'local')
            };
        }

        // Complex resolution with includes, fetch, and macro expansions
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
            if (line.includes('#include ') || line.includes('#fetch ') || 
                line.includes('#def ') || line.includes('#end def')) {
                return true;
            }
        }
        return false;
    }

    // Perform complex resolution with includes, fetch, and macro expansions
    private performComplexResolution(lines: string[], lineContinuationMap: Map<number, number[]>): ResolvedContent {
        const expandedLines: string[] = [];
        const sourceMap = new Map<number, number>();
        const macroExpansionLines = new Map<number, string>();
        const macros = new Map<string, { params: string[], content: string[] }>();
        const allMacros: MacroDefinition[] = [];

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
                    this.outputChannel.appendLine(`[DEBUG] Storing ${macroDefinition.isInline ? 'inline' : 'multiline'} macro: ${macroDefinition.name}`);
                    macros.set(macroDefinition.name, {
                        params: macroDefinition.params,
                        content: macroDefinition.content
                    });
                    
                    // Add to all macros collection
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
                this.outputChannel.appendLine(`[DEBUG] Include resolved to ${includedLines.length} lines`);
                
                // Collect macros from included content
                const includedMacros = this.collectAllMacroDefinitions(includedLines, 'include', line.replace('#include ', '').trim());
                allMacros.push(...includedMacros);
                
                for (const includedLine of includedLines) {
                    expandedLines.push(includedLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
                }
                continue;
            }

            // Handle fetch operations
            if (line.startsWith('#fetch ')) {
                this.outputChannel.appendLine(`[DEBUG] Processing fetch: ${line}`);
                const fetchedLines = this.resolveFetch(line);
                this.outputChannel.appendLine(`[DEBUG] Fetch resolved to ${fetchedLines.length} lines`);
                
                // Collect macros from fetched content
                const fetchedMacros = this.collectAllMacroDefinitions(fetchedLines, 'fetch', line.replace('#fetch ', '').trim());
                allMacros.push(...fetchedMacros);
                
                for (const fetchedLine of fetchedLines) {
                    expandedLines.push(fetchedLine);
                    sourceMap.set(expandedLines.length - 1, originalLineNumber);
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
                    // Mark lines that came from macro expansions
                    if (isFromMacroExpansion) {
                        macroExpansionLines.set(expandedLines.length - 1, lines[i]);
                    }
                }
            } else {
                expandedLines.push(expandedLine);
                sourceMap.set(expandedLines.length - 1, originalLineNumber);
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

        return {
            expandedLines,
            sourceMap,
            macroExpansionLines,
            lineContinuationMap,
            userDefinedFunctions,
            functionsWithParams: this.collectUserDefinedFunctionsWithParams(expandedLines),
            userDefinedMacros,
            definedVariables,
            variablesWithDefinitions: this.collectDefinedVariablesWithValues(expandedLines),
            allMacros
        };
    }

    // Collect all macro definitions with source information
    private collectAllMacroDefinitions(lines: string[], source: 'local' | 'include' | 'fetch', sourceFile?: string): MacroDefinition[] {
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

    // Rest of the methods remain the same as in the original linter...
    // (I'll include the key ones needed for the resolver)

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

    private collectUserDefinedFunctionsWithParams(lines: string[]): Array<{name: string, params: string[]}> {
        const userFunctions: Array<{name: string, params: string[]}> = [];
        
        for (const line of lines) {
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
                userFunctions.push({name: funcName, params: params});
            }
        }
        
        return userFunctions;
    }

    private collectUserDefinedMacros(lines: string[]): Map<string, number> {
        const userMacros = new Map<string, number>();
        
        for (const line of lines) {
            if (line.trim() === '' || line.trim().startsWith("'") || line.trim().startsWith('"')) {
                continue;
            }
            
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('#def ')) {
                continue;
            }

            const macroDefinition = this.parseMacroDefinition(trimmedLine);
            if (macroDefinition) {
                userMacros.set(macroDefinition.name, macroDefinition.params.length);
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

    private collectDefinedVariablesWithValues(lines: string[]): Array<{name: string, definition: string}> {
        const variables: Array<{name: string, definition: string}> = [];
        
        for (const line of lines) {
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
                    variables.push({name: varName, definition: definition});
                }
            }
        }
        
        return variables;
    }
}