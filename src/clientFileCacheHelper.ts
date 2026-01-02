import * as vscode from 'vscode';
import { ClientFileCache } from './api/calcpadApiTypes';

// Regex patterns to extract filenames from #include and #read directives
// #include filename.cpd (simple filename, no path or API routing)
const INCLUDE_REGEX = /^#include\s+(?!<)([^\s<>]+\.cpd)\s*$/gm;
// #read varname from filename.csv@... (simple filename, no path or API routing)
const READ_REGEX = /^#read\s+\w+\s+from\s+(?!<)([^\s<>@]+\.(csv|txt))/gm;

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
 * Extract filenames referenced in #include and #read directives from content.
 * Only extracts simple filenames (not paths or API routing syntax).
 * Extracts from entire source document (does not strip #local blocks from source).
 */
export function extractReferencedFilenames(content: string): string[] {
    const filenames: Set<string> = new Set();

    // Reset regex lastIndex for global patterns
    INCLUDE_REGEX.lastIndex = 0;
    READ_REGEX.lastIndex = 0;

    let match;
    while ((match = INCLUDE_REGEX.exec(content)) !== null) {
        filenames.add(match[1]);
    }

    while ((match = READ_REGEX.exec(content)) !== null) {
        filenames.add(match[1]);
    }

    return Array.from(filenames);
}

/**
 * Build a client file cache for the referenced files that exist in the workspace.
 * Returns a simple dictionary of filename -> base64 content.
 * Content within #local...#global blocks is stripped before encoding.
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

    for (const filename of referencedFilenames) {
        try {
            // Search for the file in the workspace
            const pattern = '**/' + filename;
            const foundFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);

            if (foundFiles.length > 0) {
                const fileUri = foundFiles[0];
                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                const contentString = Buffer.from(fileContent).toString('utf-8');

                // Strip #local...#global blocks before encoding
                const strippedContent = stripLocalBlocks(contentString);
                const contentBase64 = Buffer.from(strippedContent, 'utf-8').toString('base64');

                cache[filename] = contentBase64;

                if (debugChannel) {
                    debugChannel.appendLine(logPrefix + ' Cached file: ' + filename + ' (' + strippedContent.length + ' bytes after stripping local blocks) from ' + fileUri.fsPath);
                }
            } else {
                if (debugChannel) {
                    debugChannel.appendLine(logPrefix + ' File not found in workspace: ' + filename);
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
