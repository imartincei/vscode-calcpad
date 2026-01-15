import * as vscode from 'vscode';
import * as path from 'path';
import { ClientFileCache } from './api/calcpadApiTypes';

/**
 * Expand environment variables in a path.
 * Handles both Windows (%VAR%) and Unix ($VAR) syntax.
 */
function expandEnvironmentVariables(filePath: string): string {
    // Expand Windows-style %VAR%
    let result = filePath.replace(/%([^%]+)%/g, (_, varName) => {
        return process.env[varName] || process.env[varName.toUpperCase()] || '%' + varName + '%';
    });

    // Expand Unix-style $VAR or ${VAR}
    result = result.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        return process.env[varName] || '${' + varName + '}';
    });
    result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, varName) => {
        return process.env[varName] || '$' + varName;
    });

    return result;
}

/**
 * Check if a path is absolute (after expanding environment variables).
 */
function isAbsolutePath(filePath: string): boolean {
    const expanded = expandEnvironmentVariables(filePath);
    return path.isAbsolute(expanded);
}

// Regex to remove #local...#global blocks (content inside should not be sent to server)
const LOCAL_BLOCK_REGEX = /^#local\s*$[\s\S]*?^#global\s*$/gm;
// Regex to remove #local with no matching #global (removes from #local to end of file)
const LOCAL_TO_END_REGEX = /^#local\s*$[\s\S]*$/gm;
// Regex to remove standalone #global directive
const STANDALONE_GLOBAL_REGEX = /^#global\s*$/gm;

/**
 * Remove #local...#global blocks from content.
 * Also removes #local without matching #global (to end of file) and standalone #global.
 * Content within these blocks should not be sent to the server.
 */
function stripLocalBlocks(content: string): string {
    let result = content.replace(LOCAL_BLOCK_REGEX, '');
    result = result.replace(LOCAL_TO_END_REGEX, '');
    result = result.replace(STANDALONE_GLOBAL_REGEX, '');
    return result;
}

/**
 * Parse #include directive and extract filename.
 * Returns null if not a valid #include or uses API routing (<...>).
 * Format: #include filename.cpd or #include filename.txt (may have spaces in filename)
 * Also handles: #include filename.cpd #{3} (input values after # are ignored)
 */
function parseIncludeDirective(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#include ')) {
        return null;
    }

    let rest = trimmed.substring(9).trim(); // After "#include "

    // Skip API routing syntax (starts with <)
    if (rest.startsWith('<')) {
        return null;
    }

    // Remove everything after # (input values like #{3})
    const hashIndex = rest.indexOf(' #');
    if (hashIndex !== -1) {
        rest = rest.substring(0, hashIndex).trim();
    }

    // Check for .cpd or .txt extension
    const cpdIndex = rest.indexOf('.cpd');
    const txtIndex = rest.indexOf('.txt');

    let extIndex = -1;
    let extLength = 0;

    if (cpdIndex !== -1) {
        extIndex = cpdIndex;
        extLength = 4; // ".cpd"
    } else if (txtIndex !== -1) {
        extIndex = txtIndex;
        extLength = 4; // ".txt"
    } else {
        return null; // No valid extension found
    }

    // Return just the filename portion (up to and including extension)
    return rest.substring(0, extIndex + extLength).trim();
}

/**
 * Parse #read directive and extract filename.
 * Returns null if not a valid #read or uses API routing (<...>).
 * Format: #read varname from filename.csv@... or #read varname from filename.txt@...
 */
function parseReadDirective(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#read ')) {
        return null;
    }

    // Find " from " to locate the filename
    const fromIndex = trimmed.indexOf(' from ');
    if (fromIndex === -1) {
        return null;
    }

    const afterFrom = trimmed.substring(fromIndex + 6).trim(); // After " from "

    // Skip API routing syntax (starts with <)
    if (afterFrom.startsWith('<')) {
        return null;
    }

    // Find the @ symbol that separates filename from range specification
    const atIndex = afterFrom.indexOf('@');
    let filename: string;
    if (atIndex !== -1) {
        filename = afterFrom.substring(0, atIndex).trim();
    } else {
        // No @, take everything up to end or whitespace after extension
        const csvMatch = afterFrom.match(/^(.+\.csv)(?:\s|$)/i);
        const txtMatch = afterFrom.match(/^(.+\.txt)(?:\s|$)/i);
        if (csvMatch) {
            filename = csvMatch[1].trim();
        } else if (txtMatch) {
            filename = txtMatch[1].trim();
        } else {
            return null;
        }
    }

    // Validate extension
    if (!filename.endsWith('.csv') && !filename.endsWith('.txt')) {
        return null;
    }

    return filename;
}

/**
 * Extract filenames referenced in #include and #read directives from content.
 * Only extracts simple filenames (not paths or API routing syntax).
 * Handles filenames with spaces.
 * Extracts from entire source document (does not strip #local blocks from source).
 */
function extractReferencedFilenames(content: string): string[] {
    const filenames: Set<string> = new Set();
    const lines = content.split('\n');

    for (const line of lines) {
        // Try #include
        const includeFile = parseIncludeDirective(line);
        if (includeFile) {
            filenames.add(includeFile);
            continue;
        }

        // Try #read
        const readFile = parseReadDirective(line);
        if (readFile) {
            filenames.add(readFile);
        }
    }

    return Array.from(filenames);
}

/**
 * Extract filenames from global scope only (strips #local blocks first).
 * Used for recursively finding references in included files.
 */
function extractReferencedFilenamesFromGlobalScope(content: string): string[] {
    const globalContent = stripLocalBlocks(content);
    return extractReferencedFilenames(globalContent);
}

/**
 * Build a client file cache for the referenced files that exist in the workspace.
 * Returns a simple dictionary of filename -> base64 content.
 * Content within #local...#global blocks is stripped before encoding.
 * Recursively includes files referenced by included .cpd files (from their global scope only).
 */
export async function buildClientFileCache(
    referencedFilenames: string[],
    debugChannel?: vscode.OutputChannel,
    logPrefix: string = '[FileCache]'
): Promise<ClientFileCache | undefined> {
    if (referencedFilenames.length === 0) {
        return undefined;
    }

    if (debugChannel) {
        debugChannel.appendLine(logPrefix + ' Looking for referenced files: ' + referencedFilenames.join(', '));
    }

    const cache: ClientFileCache = {};
    const processedFiles = new Set<string>();
    const pendingFiles = [...referencedFilenames];

    while (pendingFiles.length > 0) {
        const filename = pendingFiles.shift()!;

        // Skip if already processed (prevents infinite loops from circular includes)
        if (processedFiles.has(filename)) {
            continue;
        }
        processedFiles.add(filename);

        try {
            let fileUri: vscode.Uri | undefined;
            let contentString: string | undefined;

            // Expand environment variables in the filename
            const expandedFilename = expandEnvironmentVariables(filename);

            // Check if the path is absolute (after expansion)
            if (isAbsolutePath(filename)) {
                // Try to read directly from the absolute path
                try {
                    fileUri = vscode.Uri.file(expandedFilename);
                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                    contentString = Buffer.from(fileContent).toString('utf-8');

                    if (debugChannel) {
                        debugChannel.appendLine(logPrefix + ' Found absolute path: ' + expandedFilename);
                    }
                } catch {
                    // File doesn't exist at absolute path
                    fileUri = undefined;
                    if (debugChannel) {
                        debugChannel.appendLine(logPrefix + ' Absolute path not accessible: ' + expandedFilename);
                    }
                }
            } else {
                // Search for the file in the workspace (relative filename)
                const pattern = '**/' + filename;
                const foundFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);

                if (foundFiles.length > 0) {
                    fileUri = foundFiles[0];
                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                    contentString = Buffer.from(fileContent).toString('utf-8');
                }
            }

            if (fileUri && contentString !== undefined) {
                // Strip #local...#global blocks before encoding
                const strippedContent = stripLocalBlocks(contentString);
                const contentBase64 = Buffer.from(strippedContent, 'utf-8').toString('base64');

                // Cache with the original filename (as it appears in the source)
                cache[filename] = contentBase64;

                if (debugChannel) {
                    debugChannel.appendLine(logPrefix + ' Cached file: ' + filename + ' (' + strippedContent.length + ' bytes after stripping local blocks) from ' + fileUri.fsPath);
                }

                // For .cpd files, recursively find referenced files from global scope
                if (filename.endsWith('.cpd')) {
                    const nestedReferences = extractReferencedFilenamesFromGlobalScope(contentString);
                    for (const nestedFile of nestedReferences) {
                        if (!processedFiles.has(nestedFile) && !pendingFiles.includes(nestedFile)) {
                            pendingFiles.push(nestedFile);
                            if (debugChannel) {
                                debugChannel.appendLine(logPrefix + ' Found nested reference in ' + filename + ': ' + nestedFile);
                            }
                        }
                    }
                }
            } else {
                if (debugChannel) {
                    debugChannel.appendLine(logPrefix + ' File not found: ' + filename + (filename !== expandedFilename ? ' (expanded: ' + expandedFilename + ')' : ''));
                }
            }
        } catch (error) {
            if (debugChannel) {
                debugChannel.appendLine(logPrefix + ' Error reading file ' + filename + ': ' + (error instanceof Error ? error.message : String(error)));
            }
        }
    }

    if (Object.keys(cache).length === 0) {
        return undefined;
    }

    return cache;
}

/**
 * Build a client file cache from content by extracting referenced filenames and loading them.
 * Convenience function that combines extractReferencedFilenames and buildClientFileCache.
 */
export async function buildClientFileCacheFromContent(
    content: string,
    debugChannel?: vscode.OutputChannel,
    logPrefix: string = '[FileCache]'
): Promise<ClientFileCache | undefined> {
    const referencedFilenames = extractReferencedFilenames(content);
    return buildClientFileCache(referencedFilenames, debugChannel, logPrefix);
}
