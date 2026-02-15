/**
 * Logging adapter interface.
 * VS Code extension provides vscode.OutputChannel.
 * Electron app provides console or file logger.
 */
export interface ILogger {
    appendLine(message: string): void;
}

/**
 * File system adapter interface.
 * VS Code extension provides vscode.workspace.fs.
 * Electron app provides Node.js fs.
 */
export interface IFileSystem {
    readFile(path: string): Promise<Uint8Array>;
    exists(path: string): Promise<boolean>;
}
