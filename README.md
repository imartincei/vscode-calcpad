# VS Code CalcPad Extension

A VS Code extension for CalcPad files with live preview and comprehensive linting.

## Features

- **Live HTML Preview**: Real-time preview of CalcPad calculations with automatic updates
- **Comprehensive Linting**: Syntax validation including:
  - Parentheses, brackets, and brace balancing
  - Control block matching (`#if`/`#end`, `#for`/`#loop`)
  - Variable naming and function validation
  - Unit checking and operator syntax
- **CalcPad Language Support**: Syntax highlighting for `.cpd` and `.cpdz` files
- **Server Integration**: Connects to Calcpad.Server for accurate rendering

## Usage

1. Open a `.cpd` or `.cpdz` file
2. Click the preview button in the editor toolbar or use `Ctrl+Shift+P` → "CalcPad Preview"
3. Preview updates automatically as you type
4. Linting errors appear as you work

## Configuration

Set the Calcpad.Server URL in VS Code settings:
```json
{
  "calcpad.apiBaseUrl": "http://localhost:9420"
}
```

## Requirements

- Calcpad.Server running at configured URL
- VS Code 1.74.0 or higher