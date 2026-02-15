import * as vscode from 'vscode';
import type { ILogger, IFileSystem } from 'calcpad-frontend';

export class VSCodeLogger implements ILogger {
    constructor(private channel: vscode.OutputChannel) {}
    appendLine(msg: string): void {
        this.channel.appendLine(msg);
    }
}

export class VSCodeFileSystem implements IFileSystem {
    async readFile(filePath: string): Promise<Uint8Array> {
        return vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    }
    async exists(filePath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return true;
        } catch {
            return false;
        }
    }
}
