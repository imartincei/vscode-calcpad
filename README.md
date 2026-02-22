# IMPORTANT UPDATE:
I will no longer be updating this repo's source code. I have moved this to a branch on my fork of the private Calcpad repo to keep everything in sync and make dev easier. If you want to get involved with development, please feel free to reach out if you do not have access to the Calcpad private repo.

I will still release builds here.

# VS Code CalcPad Extension

A VS Code extension for CalcPad files with live preview and comprehensive linting.

## Installation

### 1. Install the VS Code Extension

Download the `.vsix` file from the [releases page](https://github.com/imartincei/vscode-calcpad/releases).

Install the extension in VS Code:
- Open VS Code
- Go to Extensions view (Ctrl+Shift+X)
- Click the "..." menu at the top of Extensions view
- Select "Install from VSIX..."
- Choose the downloaded `.vsix` file

For more details, see the [VS Code extension installation guide](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace).

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

1. Open a `.cpd` file
2. Click the preview button in the editor toolbar or use `Ctrl+Shift+P` -> "CalcPad Preview"
3. Preview updates automatically as you type
4. Linting errors appear as you work

## UI Buttons
<img width="1919" height="2381" alt="image" src="https://github.com/user-attachments/assets/7e1dbdf8-e7d0-4b48-9ce1-acbcaf7c263d" />



## Requirements

- VS Code 1.74.0 or higher

## Development

This extension uses a Vue 3 webview panel for the sidebar UI (Insert, Variables, Settings, and S3 tabs). The Vue app is built with Vite and communicates with the extension host via VS Code's webview messaging API.

### Architecture

- **Extension Host**: TypeScript running in Node.js context (`src/extension.ts`)
- **Webview Panel**: Vue 3 SPA built with Vite (`src/CalcpadVuePanel/`)
- **Server Communication**: All CalcPad processing (preview, linting, PDF) is delegated to Calcpad.Server via REST API. There is a bundled .dll that spawns a local server automaticallu, but you can also point the extension to a remote server.
