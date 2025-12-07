/**
 * Template generator for CalcPad preview panels with HTML/Raw toggle functionality
 */

export function generateToggleWrapperHtml(htmlContent: string, isUnwrapped: boolean, nonce: string): string {
    // Escape the HTML content for safe embedding in JavaScript
    const escapedHtml = JSON.stringify(htmlContent);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CalcPad Preview${isUnwrapped ? ' Unwrapped' : ''}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
        }

        /* Toggle toolbar styles */
        #toggle-toolbar {
            position: sticky;
            top: 0;
            z-index: 1000;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 4px 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #toggle-view-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 4px 12px;
            font-size: 11px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            border-radius: 2px;
            outline: none;
            transition: background-color 0.1s ease;
        }

        #toggle-view-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        #toggle-view-btn:active {
            background: var(--vscode-button-background);
            opacity: 0.9;
        }

        #toggle-view-btn:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }

        /* View container styles */
        .view-container {
            display: block;
            height: calc(100vh - 32px);
            overflow: auto;
        }

        .view-container.hidden {
            display: none;
        }

        /* Rendered view styles */
        #rendered-view {
            background: var(--vscode-editor-background);
            border: none;
            width: 100%;
            height: 100%;
        }

        /* Raw HTML view styles */
        #raw-view {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size, 12px);
        }

        #raw-view pre {
            margin: 0;
            padding: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-x: auto;
        }

        #raw-view code {
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Monaco', 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 1.5;
            color: var(--vscode-editor-foreground);
        }

        /* Scrollbar styling for better UX */
        ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        ::-webkit-scrollbar-thumb:active {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }

        /* Empty state message */
        .empty-message {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <!-- Toggle toolbar -->
    <div id="toggle-toolbar">
        <button id="toggle-view-btn" title="Toggle between rendered HTML and raw HTML source">
            <span id="btn-label">Show Raw HTML</span>
        </button>
    </div>

    <!-- Rendered view container -->
    <div id="rendered-view" class="view-container"></div>

    <!-- Raw HTML view container -->
    <div id="raw-view" class="view-container hidden">
        <pre><code id="raw-html-content"></code></pre>
    </div>

    <script nonce="${nonce}">
        // VS Code API
        const vscode = acquireVsCodeApi();

        // DOM elements
        const renderedView = document.getElementById('rendered-view');
        const rawView = document.getElementById('raw-view');
        const toggleBtn = document.getElementById('toggle-view-btn');
        const btnLabel = document.getElementById('btn-label');
        const rawHtmlContent = document.getElementById('raw-html-content');

        // Store the raw HTML content
        const rawHtml = ${escapedHtml};

        /**
         * Extract body content from a full HTML document
         */
        function extractBodyContent(htmlString) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');

            if (doc.body) {
                return doc.body.innerHTML;
            }
            return htmlString;
        }

        /**
         * Initialize error navigation for div-based rendering
         */
        function initializeErrorNavigation() {
            setTimeout(() => {
                const errorLinks = document.querySelectorAll('#rendered-view a[data-text]');
                errorLinks.forEach(link => {
                    link.addEventListener('click', function(e) {
                        e.preventDefault();
                        const lineNumber = this.getAttribute('data-text');
                        if (lineNumber) {
                            vscode.postMessage({
                                type: 'navigateToLine',
                                line: parseInt(lineNumber, 10)
                            });
                        }
                    });
                });
            }, 100);
        }

        /**
         * Update the view based on current mode
         */
        function updateView() {
            const state = vscode.getState() || { mode: 'rendered' };
            const mode = state.mode;

            if (mode === 'rendered') {
                // Show rendered HTML view
                renderedView.classList.remove('hidden');
                rawView.classList.add('hidden');
                btnLabel.textContent = 'Show Raw HTML';
                toggleBtn.title = 'Show raw HTML source';

                // Populate rendered view (always update on mode change)
                if (rawHtml && rawHtml.trim().length > 0) {
                    // Extract body content and inject into div
                    const bodyContent = extractBodyContent(rawHtml);
                    renderedView.innerHTML = bodyContent;
                    initializeErrorNavigation();
                } else {
                    renderedView.innerHTML = '<div class="empty-message">No content to display</div>';
                }
            } else {
                // Show raw HTML view
                renderedView.classList.add('hidden');
                rawView.classList.remove('hidden');
                btnLabel.textContent = 'Show Rendered';
                toggleBtn.title = 'Show rendered HTML';

                // Populate raw view if empty
                if (!rawHtmlContent.textContent) {
                    if (rawHtml && rawHtml.trim().length > 0) {
                        // Using textContent automatically escapes HTML
                        rawHtmlContent.textContent = rawHtml;
                    } else {
                        rawHtmlContent.textContent = '<!-- No content available -->';
                    }
                }
            }
        }

        /**
         * Toggle between rendered and raw views
         */
        function toggleView() {
            const currentState = vscode.getState() || { mode: 'rendered' };
            const newMode = currentState.mode === 'rendered' ? 'raw' : 'rendered';

            // Save new state
            vscode.setState({ mode: newMode });

            // Update the view
            updateView();
        }

        // Set up toggle button event listener
        toggleBtn.addEventListener('click', toggleView);

        // Initialize view on load
        updateView();
    </script>
</body>
</html>`;
}
