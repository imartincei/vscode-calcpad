import * as vscode from 'vscode';

type InlineFormat = 'bold' | 'italic' | 'underline' | 'subscript' | 'superscript';
type CommentFormat = 'html' | 'markdown';
type CommentFormatSetting = 'html' | 'markdown' | 'auto';

const HTML_INLINE: Record<InlineFormat, [string, string]> = {
    bold: ['<strong>', '</strong>'],
    italic: ['<em>', '</em>'],
    underline: ['<ins>', '</ins>'],
    subscript: ['<sub>', '</sub>'],
    superscript: ['<sup>', '</sup>']
};

const MARKDOWN_INLINE: Record<InlineFormat, [string, string]> = {
    bold: ['**', '**'],
    italic: ['*', '*'],
    underline: ['++', '++'],
    subscript: ['~', '~'],
    superscript: ['^', '^']
};

/**
 * Handles text formatting hotkeys for Calcpad comment lines.
 * Supports HTML and Markdown modes via the calcpad.commentFormat setting.
 */
export class CommentFormatter {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    public registerCommands(): vscode.Disposable[] {
        return [
            // Inline formatting
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatBold', (e) => this.wrapInline(e, 'bold')),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatItalic', (e) => this.wrapInline(e, 'italic')),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatUnderline', (e) => this.wrapInline(e, 'underline')),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatSubscript', (e) => this.wrapInline(e, 'subscript')),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatSuperscript', (e) => this.wrapInline(e, 'superscript')),

            // Headings
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatHeading1', (e) => this.insertHeading(e, 1)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatHeading2', (e) => this.insertHeading(e, 2)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatHeading3', (e) => this.insertHeading(e, 3)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatHeading4', (e) => this.insertHeading(e, 4)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatHeading5', (e) => this.insertHeading(e, 5)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatHeading6', (e) => this.insertHeading(e, 6)),

            // Block elements
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatParagraph', (e) => this.insertParagraph(e)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatLineBreak', (e) => this.insertLineBreak(e)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatBulletedList', (e) => this.insertBulletedList(e)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.formatNumberedList', (e) => this.insertNumberedList(e)),

            // Comments
            vscode.commands.registerTextEditorCommand('vscode-calcpad.toggleComment', (e) => this.toggleComment(e)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.uncomment', (e) => this.uncomment(e)),
            vscode.commands.registerTextEditorCommand('vscode-calcpad.pasteAsComment', (e) => this.pasteAsComment(e))
        ];
    }

    private getFormat(): CommentFormat {
        const config = vscode.workspace.getConfiguration('calcpad');
        const setting = config.get<string>('commentFormat', 'html');

        if (setting === 'markdown') {
            return 'markdown';
        }
        if (setting === 'auto') {
            return this.detectFormatAtCursor();
        }
        return 'html';
    }

    /**
     * Scan from the top of the document to the cursor position,
     * tracking #md on / #md off directives to determine the active format.
     * Default is HTML when no directive is found.
     */
    private detectFormatAtCursor(): CommentFormat {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return 'html';
        }

        const cursorLine = editor.selection.active.line;
        let mdActive = false;

        for (let i = 0; i <= cursorLine; i++) {
            const lineText = editor.document.lineAt(i).text.trim();
            if (lineText === '#md on') {
                mdActive = true;
            } else if (lineText === '#md off') {
                mdActive = false;
            }
        }

        return mdActive ? 'markdown' : 'html';
    }

    /**
     * Strip the leading comment prefix (') from a line, returning [prefix, content].
     */
    /**
     * Strip the leading comment prefix (') and trailing auto-bracket (') from a line.
     * Returns [prefix, content, trailingQuote].
     */
    private stripCommentPrefix(lineText: string): [string, string, string] {
        if (lineText.startsWith("'")) {
            const inner = lineText.substring(1);
            if (inner.endsWith("'")) {
                return ["'", inner.slice(0, -1), "'"];
            }
            return ["'", inner, ''];
        }
        return ['', lineText, ''];
    }

    /**
     * Wrap selected text with inline formatting tags.
     * Works within comment lines — wraps the selection in place.
     */
    private async wrapInline(editor: vscode.TextEditor, type: InlineFormat): Promise<void> {
        const format = this.getFormat();
        const [prefix, suffix] = format === 'html' ? HTML_INLINE[type] : MARKDOWN_INLINE[type];

        const wasEmpty = editor.selections.map(s => s.isEmpty);

        await editor.edit(editBuilder => {
            for (const selection of editor.selections) {
                const selectedText = editor.document.getText(selection);
                if (selectedText) {
                    editBuilder.replace(selection, prefix + selectedText + suffix);
                } else {
                    editBuilder.insert(selection.active, prefix + suffix);
                }
            }
        });

        // For cursors that had no selection, place cursor between prefix and suffix
        const newSelections: vscode.Selection[] = [];
        for (let i = 0; i < editor.selections.length; i++) {
            if (wasEmpty[i]) {
                const pos = editor.selections[i].active;
                const newPos = new vscode.Position(pos.line, pos.character - suffix.length);
                newSelections.push(new vscode.Selection(newPos, newPos));
            } else {
                newSelections.push(editor.selections[i]);
            }
        }
        editor.selections = newSelections;
    }

    /**
     * Wrap the current line(s) in a heading tag.
     * Strips any existing heading tags/markdown headings first.
     */
    private async insertHeading(editor: vscode.TextEditor, level: number): Promise<void> {
        const format = this.getFormat();
        const contentWasEmpty: boolean[] = [];

        await editor.edit(editBuilder => {
            for (const selection of editor.selections) {
                const line = editor.document.lineAt(selection.active.line);
                const lineRange = line.range;
                let [commentPrefix, content, trailingQuote] = this.stripCommentPrefix(line.text);

                // Strip existing HTML heading tags
                const htmlHeadingMatch = content.match(/^<h[1-6]>(.*)<\/h[1-6]>$/);
                if (htmlHeadingMatch) {
                    content = htmlHeadingMatch[1];
                }

                // Strip existing markdown headings
                const mdHeadingMatch = content.match(/^(#{1,6})\s+(.*)$/);
                if (mdHeadingMatch) {
                    content = mdHeadingMatch[2];
                }

                contentWasEmpty.push(content.trim().length === 0);

                let newLine: string;
                if (format === 'html') {
                    newLine = `'<h${level}>${content}</h${level}>${trailingQuote}`;
                } else {
                    const hashes = '#'.repeat(level);
                    newLine = `'${hashes} ${content}${trailingQuote}`;
                }

                editBuilder.replace(lineRange, newLine);
            }
        });

        // Place cursor between tags when content was empty
        if (format === 'html') {
            const closingTag = `</h${level}>`;
            const newSelections: vscode.Selection[] = [];
            for (let i = 0; i < editor.selections.length; i++) {
                if (contentWasEmpty[i]) {
                    const pos = editor.selections[i].active;
                    const lineEnd = editor.document.lineAt(pos.line).range.end;
                    const newPos = new vscode.Position(lineEnd.line, lineEnd.character - closingTag.length);
                    newSelections.push(new vscode.Selection(newPos, newPos));
                } else {
                    newSelections.push(editor.selections[i]);
                }
            }
            editor.selections = newSelections;
        }
    }

    /**
     * Wrap selected lines in <p>...</p> tags.
     */
    private async insertParagraph(editor: vscode.TextEditor): Promise<void> {
        await editor.edit(editBuilder => {
            for (const selection of editor.selections) {
                const line = editor.document.lineAt(selection.active.line);
                const lineRange = line.range;
                const [, content, trailingQuote] = this.stripCommentPrefix(line.text);

                editBuilder.replace(lineRange, `'<p>${content}</p>${trailingQuote}`);
            }
        });
    }

    /**
     * Insert a <br/> line break at the cursor position.
     */
    private async insertLineBreak(editor: vscode.TextEditor): Promise<void> {
        await editor.edit(editBuilder => {
            for (const selection of editor.selections) {
                editBuilder.insert(selection.active, "'<br/>\n");
            }
        });
    }

    /**
     * Wrap selected lines as a bulleted list.
     */
    private async insertBulletedList(editor: vscode.TextEditor): Promise<void> {
        const format = this.getFormat();

        await editor.edit(editBuilder => {
            const startLine = editor.selection.start.line;
            const endLine = editor.selection.end.line;
            const lines: string[] = [];

            if (format === 'html') {
                lines.push("'<ul>");
                for (let i = startLine; i <= endLine; i++) {
                    const [, content, tq] = this.stripCommentPrefix(editor.document.lineAt(i).text);
                    lines.push(`'<li>${content}</li>${tq}`);
                }
                lines.push("'</ul>");
            } else {
                for (let i = startLine; i <= endLine; i++) {
                    const [, content, tq] = this.stripCommentPrefix(editor.document.lineAt(i).text);
                    lines.push(`'- ${content}${tq}`);
                }
            }

            const fullRange = new vscode.Range(
                editor.document.lineAt(startLine).range.start,
                editor.document.lineAt(endLine).range.end
            );
            editBuilder.replace(fullRange, lines.join('\n'));
        });
    }

    /**
     * Wrap selected lines as a numbered list.
     */
    private async insertNumberedList(editor: vscode.TextEditor): Promise<void> {
        const format = this.getFormat();

        await editor.edit(editBuilder => {
            const startLine = editor.selection.start.line;
            const endLine = editor.selection.end.line;
            const lines: string[] = [];

            if (format === 'html') {
                lines.push("'<ol>");
                for (let i = startLine; i <= endLine; i++) {
                    const [, content, tq] = this.stripCommentPrefix(editor.document.lineAt(i).text);
                    lines.push(`'<li>${content}</li>${tq}`);
                }
                lines.push("'</ol>");
            } else {
                let num = 1;
                for (let i = startLine; i <= endLine; i++) {
                    const [, content, tq] = this.stripCommentPrefix(editor.document.lineAt(i).text);
                    lines.push(`'${num}. ${content}${tq}`);
                    num++;
                }
            }

            const fullRange = new vscode.Range(
                editor.document.lineAt(startLine).range.start,
                editor.document.lineAt(endLine).range.end
            );
            editBuilder.replace(fullRange, lines.join('\n'));
        });
    }

    /**
     * Toggle comment prefix (') on selected lines.
     */
    private async toggleComment(editor: vscode.TextEditor): Promise<void> {
        await editor.edit(editBuilder => {
            const startLine = editor.selection.start.line;
            const endLine = editor.selection.end.line;

            // Check if all lines are already commented
            let allCommented = true;
            for (let i = startLine; i <= endLine; i++) {
                if (!editor.document.lineAt(i).text.startsWith("'")) {
                    allCommented = false;
                    break;
                }
            }

            for (let i = startLine; i <= endLine; i++) {
                const line = editor.document.lineAt(i);
                if (allCommented) {
                    // Remove comment prefix
                    if (line.text.startsWith("'")) {
                        editBuilder.delete(new vscode.Range(
                            new vscode.Position(i, 0),
                            new vscode.Position(i, 1)
                        ));
                    }
                } else {
                    // Add comment prefix
                    editBuilder.insert(new vscode.Position(i, 0), "'");
                }
            }
        });
    }

    /**
     * Remove comment prefix (') from selected lines.
     */
    private async uncomment(editor: vscode.TextEditor): Promise<void> {
        await editor.edit(editBuilder => {
            const startLine = editor.selection.start.line;
            const endLine = editor.selection.end.line;

            for (let i = startLine; i <= endLine; i++) {
                const line = editor.document.lineAt(i);
                if (line.text.startsWith("'")) {
                    editBuilder.delete(new vscode.Range(
                        new vscode.Position(i, 0),
                        new vscode.Position(i, 1)
                    ));
                }
            }
        });
    }

    /**
     * Paste clipboard contents as comment lines (each line prefixed with ').
     */
    private async pasteAsComment(editor: vscode.TextEditor): Promise<void> {
        const clipboardText = await vscode.env.clipboard.readText();
        if (!clipboardText) {
            return;
        }

        const commentedLines = clipboardText
            .split('\n')
            .map(line => "'" + line)
            .join('\n');

        await editor.edit(editBuilder => {
            if (editor.selection.isEmpty) {
                editBuilder.insert(editor.selection.active, commentedLines);
            } else {
                editBuilder.replace(editor.selection, commentedLines);
            }
        });
    }
}
