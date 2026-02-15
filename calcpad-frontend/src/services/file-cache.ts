import * as path from 'path';
import type { ClientFileCache } from '../types/api';
import type { ILogger, IFileSystem } from '../types/interfaces';

/**
 * Expand environment variables in a path.
 * Handles both Windows (%VAR%) and Unix ($VAR) syntax.
 */
export function expandEnvironmentVariables(filePath: string): string {
    let result = filePath.replace(/%([^%]+)%/g, (_, varName) => {
        return process.env[varName] || process.env[varName.toUpperCase()] || '%' + varName + '%';
    });

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
export function isAbsolutePath(filePath: string): boolean {
    const expanded = expandEnvironmentVariables(filePath);
    return path.isAbsolute(expanded);
}

// Regex to remove #local...#global blocks
const LOCAL_BLOCK_REGEX = /^#local\s*$[\s\S]*?^#global\s*$/gm;
const LOCAL_TO_END_REGEX = /^#local\s*$[\s\S]*$/gm;
const STANDALONE_GLOBAL_REGEX = /^#global\s*$/gm;

/**
 * Remove #local...#global blocks from content.
 */
export function stripLocalBlocks(content: string): string {
    let result = content.replace(LOCAL_BLOCK_REGEX, '');
    result = result.replace(LOCAL_TO_END_REGEX, '');
    result = result.replace(STANDALONE_GLOBAL_REGEX, '');
    return result;
}

/**
 * Parse #include directive and extract filename.
 */
export function parseIncludeDirective(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#include ')) return null;

    let rest = trimmed.substring(9).trim();
    if (rest.startsWith('<')) return null;

    const hashIndex = rest.indexOf(' #');
    if (hashIndex !== -1) {
        rest = rest.substring(0, hashIndex).trim();
    }

    const cpdIndex = rest.indexOf('.cpd');
    const txtIndex = rest.indexOf('.txt');

    let extIndex = -1;
    let extLength = 0;

    if (cpdIndex !== -1) {
        extIndex = cpdIndex;
        extLength = 4;
    } else if (txtIndex !== -1) {
        extIndex = txtIndex;
        extLength = 4;
    } else {
        return null;
    }

    return rest.substring(0, extIndex + extLength).trim();
}

/**
 * Parse #read directive and extract filename.
 */
export function parseReadDirective(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#read ')) return null;

    const fromIndex = trimmed.indexOf(' from ');
    if (fromIndex === -1) return null;

    const afterFrom = trimmed.substring(fromIndex + 6).trim();
    if (afterFrom.startsWith('<')) return null;

    const atIndex = afterFrom.indexOf('@');
    let filename: string;
    if (atIndex !== -1) {
        filename = afterFrom.substring(0, atIndex).trim();
    } else {
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

    if (!filename.endsWith('.csv') && !filename.endsWith('.txt')) return null;
    return filename;
}

/**
 * Extract filenames referenced in #include and #read directives from content.
 */
export function extractReferencedFilenames(content: string): string[] {
    const filenames: Set<string> = new Set();
    const lines = content.split('\n');

    for (const line of lines) {
        const includeFile = parseIncludeDirective(line);
        if (includeFile) {
            filenames.add(includeFile);
            continue;
        }

        const readFile = parseReadDirective(line);
        if (readFile) {
            filenames.add(readFile);
        }
    }

    return Array.from(filenames);
}

/**
 * Extract filenames from global scope only (strips #local blocks first).
 */
export function extractReferencedFilenamesFromGlobalScope(content: string): string[] {
    const globalContent = stripLocalBlocks(content);
    return extractReferencedFilenames(globalContent);
}

/**
 * Build a client file cache using the provided file system adapter.
 * Recursively includes files referenced by included .cpd files.
 */
export async function buildClientFileCache(
    referencedFilenames: string[],
    sourceDir: string,
    fileSystem: IFileSystem,
    logger?: ILogger,
    logPrefix: string = '[FileCache]'
): Promise<ClientFileCache | undefined> {
    if (referencedFilenames.length === 0) return undefined;

    logger?.appendLine(logPrefix + ' Looking for referenced files: ' + referencedFilenames.join(', '));
    logger?.appendLine(logPrefix + ' Source file directory: ' + sourceDir);

    const cache: ClientFileCache = {};
    const processedFiles = new Set<string>();
    const pendingFiles: { filename: string; resolveDir: string }[] =
        referencedFilenames.map(f => ({ filename: f, resolveDir: sourceDir }));

    while (pendingFiles.length > 0) {
        const { filename, resolveDir } = pendingFiles.shift()!;

        if (processedFiles.has(filename)) continue;
        processedFiles.add(filename);

        try {
            const expandedFilename = expandEnvironmentVariables(filename);
            let resolvedPath: string;
            let contentString: string | undefined;

            if (isAbsolutePath(filename)) {
                resolvedPath = expandedFilename;
            } else {
                resolvedPath = path.resolve(resolveDir, expandedFilename);
            }

            const exists = await fileSystem.exists(resolvedPath);
            if (exists) {
                const fileContent = await fileSystem.readFile(resolvedPath);
                contentString = Buffer.from(fileContent).toString('utf-8');
                logger?.appendLine(logPrefix + ' Found: ' + resolvedPath);
            } else {
                logger?.appendLine(logPrefix + ' Not found: ' + resolvedPath);
            }

            if (contentString !== undefined) {
                const strippedContent = stripLocalBlocks(contentString);
                const contentBase64 = Buffer.from(strippedContent, 'utf-8').toString('base64');
                cache[filename] = contentBase64;

                logger?.appendLine(logPrefix + ' Cached file: ' + filename + ' (' + strippedContent.length + ' bytes)');

                if (filename.endsWith('.cpd')) {
                    const nestedDir = path.dirname(resolvedPath);
                    const nestedReferences = extractReferencedFilenamesFromGlobalScope(contentString);
                    for (const nestedFile of nestedReferences) {
                        if (!processedFiles.has(nestedFile)) {
                            pendingFiles.push({ filename: nestedFile, resolveDir: nestedDir });
                        }
                    }
                }
            }
        } catch (error) {
            logger?.appendLine(logPrefix + ' Error reading file ' + filename + ': ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    if (Object.keys(cache).length === 0) return undefined;
    return cache;
}

/**
 * Build a client file cache from content by extracting referenced filenames and loading them.
 */
export async function buildClientFileCacheFromContent(
    content: string,
    sourceDir: string,
    fileSystem: IFileSystem,
    logger?: ILogger,
    logPrefix: string = '[FileCache]'
): Promise<ClientFileCache | undefined> {
    const referencedFilenames = extractReferencedFilenames(content);
    return buildClientFileCache(referencedFilenames, sourceDir, fileSystem, logger, logPrefix);
}
