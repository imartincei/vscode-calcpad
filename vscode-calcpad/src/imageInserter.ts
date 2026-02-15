import * as vscode from 'vscode';
import * as path from 'path';

type ImageStorageMode = 'base64' | 'imagesFolder' | 'customPath';

const IMAGE_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml'
];

const IMAGE_FILE_FILTERS: Record<string, string[]> = {
    'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
};

/**
 * Handles image insertion into Calcpad documents via clipboard paste and file picker.
 * Images are inserted as Calcpad comment lines with HTML img tags: '<img src="...">
 */
export class ImageInserter {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Register DocumentPasteEditProvider for clipboard image paste
     */
    public registerPasteProvider(): vscode.Disposable {
        const selector: vscode.DocumentSelector = [
            { language: 'calcpad' },
            { language: 'plaintext' }
        ];

        return vscode.languages.registerDocumentPasteEditProvider(
            selector,
            new CalcpadImagePasteProvider(this, this.outputChannel),
            {
                pasteMimeTypes: IMAGE_MIME_TYPES,
                providedPasteEditKinds: [vscode.DocumentDropOrPasteEditKind.Empty]
            }
        );
    }

    /**
     * Register the "Insert Image from File" command
     */
    public registerInsertCommand(): vscode.Disposable {
        return vscode.commands.registerCommand('vscode-calcpad.insertImage', async () => {
            await this.insertImageFromFile();
        });
    }

    /**
     * Open file picker and insert selected image into the active editor
     */
    private async insertImageFromFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: IMAGE_FILE_FILTERS,
            title: 'Select Image to Insert'
        });

        if (!fileUris || fileUris.length === 0) {
            return;
        }

        const fileUri = fileUris[0];
        const imageData = await vscode.workspace.fs.readFile(fileUri);
        const ext = path.extname(fileUri.fsPath).toLowerCase().replace('.', '');
        const mimeType = this.getMimeTypeFromExtension(ext);
        const filename = path.basename(fileUri.fsPath);

        this.outputChannel.appendLine(`[IMAGE INSERT] Selected file: ${fileUri.fsPath} (${mimeType})`);

        await this.processAndInsertImage(imageData, mimeType, editor, filename);
    }

    /**
     * Process image data and insert as a Calcpad comment with img tag.
     * Shows storage mode picker, saves/encodes image, inserts at cursor.
     */
    public async processAndInsertImage(
        imageData: Uint8Array,
        mimeType: string,
        editor: vscode.TextEditor,
        suggestedFilename: string
    ): Promise<void> {
        const isUntitled = editor.document.isUntitled;
        const storageMode = await this.promptStorageMode(isUntitled);

        if (!storageMode) {
            return; // User cancelled
        }

        let srcValue: string | undefined;

        switch (storageMode) {
            case 'base64':
                srcValue = this.toBase64DataUri(imageData, mimeType);
                this.outputChannel.appendLine(`[IMAGE INSERT] Embedded as base64 (${imageData.length} bytes)`);
                break;

            case 'imagesFolder':
                srcValue = await this.saveToImagesFolder(imageData, suggestedFilename, editor.document.uri);
                break;

            case 'customPath':
                srcValue = await this.saveToCustomPath(imageData, suggestedFilename, editor.document.uri);
                break;
        }

        if (srcValue) {
            await this.insertImageComment(editor, srcValue);
        }
    }

    /**
     * Show quick pick for storage mode selection
     */
    private async promptStorageMode(isUntitled: boolean): Promise<ImageStorageMode | undefined> {
        interface StorageOption extends vscode.QuickPickItem {
            mode: ImageStorageMode;
        }

        const options: StorageOption[] = [
            {
                label: 'Embed as Base64',
                detail: 'Inline the image data directly in the document',
                mode: 'base64'
            }
        ];

        if (!isUntitled) {
            options.push(
                {
                    label: 'Save to ./images/ folder',
                    detail: 'Copy image to an images subfolder relative to this document',
                    mode: 'imagesFolder'
                },
                {
                    label: 'Save to custom path...',
                    detail: 'Choose where to save the image file',
                    mode: 'customPath'
                }
            );
        }

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'How should the image be stored?',
            title: 'Image Storage'
        });

        return selected?.mode;
    }

    /**
     * Convert image data to a base64 data URI
     */
    private toBase64DataUri(imageData: Uint8Array, mimeType: string): string {
        const b64 = Buffer.from(imageData).toString('base64');
        return `data:${mimeType};base64,${b64}`;
    }

    /**
     * Save image to ./images/ subfolder relative to the document.
     * Creates directory if needed. Handles filename collisions.
     */
    private async saveToImagesFolder(
        imageData: Uint8Array,
        filename: string,
        documentUri: vscode.Uri
    ): Promise<string | undefined> {
        const documentDir = path.dirname(documentUri.fsPath);
        const imagesDir = path.join(documentDir, 'images');
        const imagesDirUri = vscode.Uri.file(imagesDir);

        // Create images directory if it doesn't exist
        try {
            await vscode.workspace.fs.createDirectory(imagesDirUri);
        } catch {
            // Directory may already exist
        }

        // Handle filename collisions
        const resolvedFilename = await this.resolveFilenameCollision(imagesDir, filename);
        const targetPath = path.join(imagesDir, resolvedFilename);
        const targetUri = vscode.Uri.file(targetPath);

        await vscode.workspace.fs.writeFile(targetUri, imageData);
        this.outputChannel.appendLine(`[IMAGE INSERT] Saved to ${targetPath}`);

        return `./images/${resolvedFilename}`;
    }

    /**
     * Prompt user for a custom save path, save image there.
     * Returns relative path from document directory to saved file.
     */
    private async saveToCustomPath(
        imageData: Uint8Array,
        filename: string,
        documentUri: vscode.Uri
    ): Promise<string | undefined> {
        const documentDir = path.dirname(documentUri.fsPath);

        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(documentDir, filename)),
            filters: IMAGE_FILE_FILTERS,
            title: 'Save Image'
        });

        if (!saveUri) {
            return undefined;
        }

        await vscode.workspace.fs.writeFile(saveUri, imageData);
        this.outputChannel.appendLine(`[IMAGE INSERT] Saved to ${saveUri.fsPath}`);

        // Compute relative path from document directory
        const relativePath = path.relative(documentDir, saveUri.fsPath);
        // Use forward slashes for consistency
        return relativePath.replace(/\\/g, '/');
    }

    /**
     * Insert the image comment line at the cursor position.
     * Format: '<img src="...">
     */
    private async insertImageComment(editor: vscode.TextEditor, srcValue: string): Promise<void> {
        const commentLine = `'<img src="${srcValue}">`;
        const position = editor.selection.active;

        await editor.edit(editBuilder => {
            // If cursor is at column 0, insert on the current line
            // Otherwise, insert on a new line after the current one
            if (position.character === 0) {
                editBuilder.insert(position, commentLine + '\n');
            } else {
                const lineEnd = editor.document.lineAt(position.line).range.end;
                editBuilder.insert(lineEnd, '\n' + commentLine);
            }
        });

        this.outputChannel.appendLine(`[IMAGE INSERT] Inserted image comment at line ${position.line + 1}`);
    }

    /**
     * Resolve filename collisions by appending a counter
     */
    private async resolveFilenameCollision(directory: string, filename: string): Promise<string> {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let candidate = filename;
        let counter = 1;

        while (true) {
            const candidateUri = vscode.Uri.file(path.join(directory, candidate));
            try {
                await vscode.workspace.fs.stat(candidateUri);
                // File exists, try next candidate
                candidate = `${base}-${counter}${ext}`;
                counter++;
            } catch {
                // File doesn't exist, use this name
                return candidate;
            }
        }
    }

    /**
     * Get MIME type from file extension
     */
    private getMimeTypeFromExtension(ext: string): string {
        const mimeMap: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml'
        };
        return mimeMap[ext] || 'image/png';
    }
}

/**
 * DocumentPasteEditProvider that intercepts image paste operations
 */
class CalcpadImagePasteProvider implements vscode.DocumentPasteEditProvider {
    constructor(
        private imageInserter: ImageInserter,
        private outputChannel: vscode.OutputChannel
    ) {}

    async provideDocumentPasteEdits(
        _document: vscode.TextDocument,
        _ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        _context: vscode.DocumentPasteEditContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        for (const mimeType of IMAGE_MIME_TYPES) {
            const item = dataTransfer.get(mimeType);
            if (!item) {
                continue;
            }

            const file = item.asFile?.();
            if (!file) {
                continue;
            }

            const imageData = await file.data();
            if (!imageData || imageData.length === 0) {
                continue;
            }

            this.outputChannel.appendLine(`[IMAGE PASTE] Detected ${mimeType} (${imageData.length} bytes)`);

            const ext = mimeType.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg');
            const filename = `pasted-image-${Date.now()}.${ext}`;

            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await this.imageInserter.processAndInsertImage(imageData, mimeType, editor, filename);
            }

            // Return empty edit to suppress default paste behavior
            const pasteEditKind = vscode.DocumentDropOrPasteEditKind.Empty;
            return [new vscode.DocumentPasteEdit('', 'Insert image', pasteEditKind)];
        }

        return undefined;
    }
}
