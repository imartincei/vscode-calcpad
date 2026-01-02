# VS Code CalcPad Extension

A VS Code extension for CalcPad files with live preview and comprehensive linting.

## Requirements

**Calcpad.Server is required** for this extension to function. The extension connects to Calcpad.Server for:
- Live HTML preview rendering
- Syntax linting and validation
- PDF generation
- Semantic token highlighting

Without a running Calcpad.Server instance, preview and linting features will not work.

## Features

- **Live HTML Preview**: Real-time preview of CalcPad calculations with automatic updates
- **Comprehensive Linting**: Server-side syntax validation including:
  - Parentheses, brackets, and brace balancing
  - Control block matching (`#if`/`#end`, `#for`/`#loop`)
  - Variable naming and function validation
  - Unit checking and operator syntax
- **CalcPad Language Support**: Syntax highlighting for `.cpd` files
- **Go to Definition**: Navigate to variable, function, and macro definitions
- **Autocomplete**: Context-aware code completion for variables, functions, and units
- **PDF Export**: Generate PDF documents from CalcPad files
- **Insert Panel**: Quick insertion of constants, operators, functions, and units
- **Operator Replacement**: Automatic symbol substitution (e.g., `<=` to `≤`)
- **Quick Typing**: Type `~` followed by a shortcut and press space to insert Greek letters and symbols (e.g., `~a` + space -> `α`, `~'` + space -> `′`)

## Usage

1. Ensure Calcpad.Server is running
2. Open a `.cpd` file
3. Click the preview button in the editor toolbar or use `Ctrl+Shift+P` -> "CalcPad Preview"
4. Preview updates automatically as you type
5. Linting errors appear as you work

## Configuration

Set the Calcpad.Server URL in VS Code settings:
```json
{
  "calcpad.server.url": "http://localhost:9420"
}
```

## Requirements

- **Calcpad.Server** running at configured URL (required)
- VS Code 1.74.0 or higher

## Development

This extension uses a Vue 3 webview panel for the sidebar UI (Insert, Variables, Settings, and S3 tabs). The Vue app is built with Vite and communicates with the extension host via VS Code's webview messaging API.

### Architecture

- **Extension Host**: TypeScript running in Node.js context (`src/extension.ts`)
- **Webview Panel**: Vue 3 SPA built with Vite (`src/CalcpadVuePanel/`)
- **Server Communication**: All CalcPad processing (preview, linting, PDF) is delegated to Calcpad.Server via REST API

### Building

```bash
npm run package    # Build both Vue app and extension
npm run build:vue  # Build Vue webview only
```
