# CalcpadStore and Server-Side Export Integration

## Executive Summary

Add bidirectional data exchange between Calcpad and JavaScript using a client-server architecture. This enables:

1. **#import** - Read from CalcpadStore, APIs, URLs, or files into string variables
2. **#export** - Write string variables to CalcpadStore or server-side export collections
3. **#read** - Read CSV matrices from CalcpadStore
4. **#write** - Write matrices to CalcpadStore or server-side export collections as CSV

## Data Storage Architecture

Two separate storage mechanisms with different access patterns:

```javascript
// Client-side bidirectional storage - both Calcpad and JS can read/write
window.calcpadStore = {
    "myKey": "value",
    "csvData": "1,2,3\n4,5,6",
    "config": '{"version": "1.0"}'
};
```

**calcpadStore** = Client-side bidirectional data sharing between Calcpad and JavaScript
**MathParser/MacroParser Export Collections** = Server-side storage for export operations when `Settings.UseVirtualPaths = true`

### UseVirtualPaths Setting

When `Settings.UseVirtualPaths = true`:
- `#write M to file.csv` stores in `ExportedMatrices["file.csv"]` (not written to disk)
- `#export data$ to file.txt` stores in `ExportedStrings["file.txt"]` (not written to disk)
- Server sends these collections to client after calculation completes

When `Settings.UseVirtualPaths = false` (default, backward compatible):
- `#write M to file.csv` writes to file system using `File.WriteAllText()`
- `#export data$ to file.txt` writes to file system using `File.WriteAllText()`
- Traditional file I/O behavior

## Syntax Examples

### #import (NEW directive)

```calcpad
' Import from CalcpadStore (JavaScript global)
#import greeting$ from <calcpadStore:myKey>
#import csvData$ from <calcpadStore:csvData>

' Import from API/URL
#import apiData$ from <myService:endpoint>{"param": "value"}
#import webData$ from <https://example.com/data.json>

' Import from file system
#import fileData$ from data.txt
```

### #export (NEW directive)

```calcpad
' Export to CalcpadStore (for Calcpad to read later)
#export result$ to <calcpadStore:processedData>

' Export to virtual path (stored in MacroParser.ExportedStrings when UseVirtualPaths=true)
#export downloadData$ to finalResult.txt

' Export to file system (written to disk when UseVirtualPaths=false)
#export csvData$ to output.csv

' Export to API (always uses API regardless of UseVirtualPaths setting)
#export jsonData$ to <myService:save>{"metadata": "value"}
```

### #read (Enhanced)

```calcpad
' Read CSV matrix from CalcpadStore
#read M from <calcpadStore:matrixData> type=R

' Traditional file reading still works
#read M from data.csv
```

### #write (Enhanced)

```calcpad
' Write matrix to CalcpadStore (for Calcpad to read later)
#write M to <calcpadStore:matrixData> type=Y sep=','

' Write to virtual path (stored in MathParser.ExportedMatrices when UseVirtualPaths=true)
#write M to downloadData.csv type=Y sep=','

' Write to file system (written to disk when UseVirtualPaths=false)
#write M to output.csv type=Y sep=','
```

## Architecture

### Settings with UseVirtualPaths

```csharp
// Calcpad.Core/Settings.cs

/// <summary>
/// Reads from window.calcpadStore by key
/// </summary>
public delegate Task<string> CalcpadStoreReader(string key);

/// <summary>
/// Writes to window.calcpadStore by key (bidirectional)
/// </summary>
public delegate Task CalcpadStoreWriter(string key, string value);

[Serializable()]
public class Settings
{
    [NonSerialized]
    public CalcpadStoreReader CalcpadStoreReader { get; set; }

    [NonSerialized]
    public CalcpadStoreWriter CalcpadStoreWriter { get; set; }

    /// <summary>
    /// When true, #write and #export directives store data in ExportedMatrices/ExportedStrings
    /// instead of writing to the file system. The server sends these collections to the client.
    /// When false, uses traditional file system operations (backward compatible).
    /// </summary>
    public bool UseVirtualPaths { get; set; } = false;
}
```

### String Storage in MacroParser

```csharp
// Calcpad.Core/Parsers/MacroParser.cs

public class MacroParser
{
    // Dictionary for imported string variables
    private readonly Dictionary<string, string> _importedStrings = new(StringComparer.Ordinal);

    // Public dictionary for exported string variables (server reads and sends to client)
    public Dictionary<string, string> ExportedStrings { get; } = new(StringComparer.Ordinal);

    internal void SetImportedString(string name, string value)
    {
        _importedStrings[name] = value;
    }

    internal string GetImportedString(string name)
    {
        return _importedStrings.TryGetValue(name, out var value) ? value : null;
    }

    internal void SetExportedString(string key, string value)
    {
        ExportedStrings[key] = value;
    }
}
```

### MacroParser Enhancements

```csharp
// Calcpad.Core/Parsers/MacroParser.cs

private enum Keywords
{
    None,
    Def,
    EndDef,
    Include,
    Import,  // NEW
    Export,  // NEW
}

public class MacroParser
{
    public CalcpadStoreReader CalcpadStoreReader { get; set; }
    public CalcpadStoreWriter CalcpadStoreWriter { get; set; }

    void ParseImport(ReadOnlySpan<char> lineContent)
    {
        // Extract: #import varName$ from <source>
        // Source types:
        // 1. <calcpadStore:key> → Call CalcpadStoreReader(key)
        // 2. <service:endpoint>body → Use Router.cs for API call
        // 3. <https://...> → Use Router.FetchUrlAsync()
        // 4. filename.txt → ClientFileCache or File.ReadAllText()

        // Store result: SetImportedString(varName, content)
    }

    void ParseExport(ReadOnlySpan<char> lineContent)
    {
        // Extract: #export varName$ to <destination>
        // Get content: GetImportedString(varName)
        // Destination types:
        // 1. <calcpadStore:key> → Call CalcpadStoreWriter(key, content)
        // 2. <service:endpoint>body → Use Router.cs for POST
        // 3. filename.txt → Check Settings.UseVirtualPaths:
        //    - If true: Store in ExportedStrings[filename] (server reads and sends to client)
        //    - If false: File.WriteAllText(filename, content) (traditional behavior)
    }
}
```

### Client-Side JavaScript Access (VSCode Extension)

```csharp
// In VSCode extension context, CalcpadStore is accessed via client-server communication

// Server-side: Read from client's calcpadStore
internal async Task<string> GetCalcpadStoreValueAsync(string key)
{
    // Send request to client to read window.calcpadStore[key]
    // Client executes: window.calcpadStore?.[key]
    // Returns value to server
}

// Server-side: Write to client's calcpadStore
internal async Task SetCalcpadStoreValueAsync(string key, string value)
{
    // Send request to client to write window.calcpadStore[key] = value
    // Client creates window.calcpadStore if needed
    // Client sets the value
}

// No separate method needed for exports - they're stored in MacroParser.ExportedStrings
// and MathParser.ExportedMatrices, which the server sends to client after calculation
```

### Server Wiring (VSCode Extension Context)

```csharp
// In the Calcpad server for VSCode extension

private void InitializeParser()
{
    _settings.CalcpadStoreReader = async (key) =>
    {
        // Send request to VSCode extension client to read calcpadStore
        return await RequestClientCalcpadStoreRead(key);
    };

    _settings.CalcpadStoreWriter = async (key, value) =>
    {
        // Send request to VSCode extension client to write to calcpadStore
        await RequestClientCalcpadStoreWrite(key, value);
    };

    if (_macroParser != null)
    {
        _macroParser.CalcpadStoreReader = _settings.CalcpadStoreReader;
        _macroParser.CalcpadStoreWriter = _settings.CalcpadStoreWriter;
    }
}

// After calculation completes, send exported data to client
private async Task SendExportedDataToClient()
{
    // Read from MacroParser.ExportedStrings and MathParser.ExportedMatrices
    var exportData = new {
        strings = _macroParser.ExportedStrings,
        matrices = _mathParser.ExportedMatrices
    };

    // Send to client, which can make available via window.calcpadExports or similar
    await SendToClient("exportData", exportData);
}
```

### DataExchange Enhancements (MathParser)

```csharp
// Calcpad.Core/Parsers/ExpressionParser/ExpressionParser.DataExchange.cs

public class ExpressionParser
{
    // Public dictionary for exported matrices (server reads and sends to client)
    public Dictionary<string, string> ExportedMatrices { get; } = new(StringComparer.Ordinal);

    internal void SetExportedMatrix(string key, string csvContent)
    {
        ExportedMatrices[key] = csvContent;
    }
}

// Modify Read() method to detect <calcpadStore:key>
// If detected:
//   1. Call CalcpadStoreReader(key) to get CSV string
//   2. Parse CSV string into matrix using existing logic

// Modify Write() method to handle destinations based on Settings.UseVirtualPaths
// 1. Convert matrix to CSV string (existing logic)
// 2. <calcpadStore:key> → Call CalcpadStoreWriter
// 3. filename.csv → Check Settings.UseVirtualPaths:
//    - If true: Store in ExportedMatrices[filename] (server reads and sends to client)
//    - If false: File.WriteAllText(filename, csvContent) (traditional behavior)
```

## Implementation Phases

### Phase 1: Core #import (Read)
1. Settings.cs - Add CalcpadStoreReader delegate and UseVirtualPaths property
2. MacroParser.cs - Add string storage (_importedStrings dictionary)
3. MacroParser.cs - Add ParseImport() with 3 source types
4. Server - Implement CalcpadStore read via client communication
5. Server - Wire up CalcpadStoreReader

### Phase 2: #export (Write)
6. Settings.cs - Ensure CalcpadStoreWriter delegate exists
7. MacroParser.cs - Add ExportedStrings dictionary and ParseExport() with Settings.UseVirtualPaths check
8. MacroParser.cs - Add SetExportedString() method
9. Server - Wire up CalcpadStoreWriter
10. Server - When UseVirtualPaths=true, send MacroParser.ExportedStrings to client after calculation

### Phase 3: #read/#write Enhancement
11. ExpressionParser.DataExchange.cs - Add ExportedMatrices dictionary
12. ExpressionParser.DataExchange.cs - Add SetExportedMatrix() method
13. ExpressionParser.DataExchange.cs - Modify Write() to check Settings.UseVirtualPaths
14. Server - When UseVirtualPaths=true, send ExpressionParser.ExportedMatrices to client after calculation

## Testing Examples

### Test 1: #import from CalcpadStore

```javascript
// Setup in WebView DevTools
window.calcpadStore = {
    "greeting": "Hello World!",
    "data": "1,2,3,4,5"
};
```

```calcpad
#import msg$ from <calcpadStore:greeting>
#import nums$ from <calcpadStore:data>
```

### Test 2: #export to server-side collection (with UseVirtualPaths=true)

```calcpad
#import input$ from <calcpadStore:userInput>
' Process the input...
#export result$ to finalOutput.txt
```

```javascript
// With UseVirtualPaths=true, server sends MacroParser.ExportedStrings to client
// Key is the filename: "finalOutput.txt"
console.log(window.calcpadExports.strings["finalOutput.txt"]);
```

### Test 3: Round-trip with #write and #read

```calcpad
' Create matrix
M = [1, 2, 3; 4, 5, 6]

' Write to CalcpadStore as CSV
#write M to <calcpadStore:matrixData> type=Y sep=','

' Read it back
#read M2 from <calcpadStore:matrixData> type=R

' Verify M == M2
```

```javascript
// Verify in client
console.log(window.calcpadStore.matrixData);
// Should show: "1,2,3\n4,5,6"
```

### Test 4: Export for user download (with UseVirtualPaths=true)

```calcpad
M = [1, 2, 3; 4, 5, 6; 7, 8, 9]
#write M to downloadCSV.csv type=Y sep=','
```

```javascript
// With UseVirtualPaths=true, server sends MathParser.ExportedMatrices to client
// Key is the filename: "downloadCSV.csv"
const csv = window.calcpadExports.matrices["downloadCSV.csv"];
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'data.csv';
a.click();
```

## Files to Modify

### Core (Calcpad.Core)
- `Settings.cs` - Add 2 delegates (CalcpadStoreReader, CalcpadStoreWriter) and UseVirtualPaths property
- `Parsers/MacroParser.cs` - Add string storage (imported and exported), #import and #export
- `Parsers/MacroParser.cs` - Add public ExportedStrings dictionary
- `Parsers/MacroParser.cs` - Check Settings.UseVirtualPaths in ParseExport() to determine destination
- `Parsers/ExpressionParser/ExpressionParser.DataExchange.cs` - Add public ExportedMatrices dictionary
- `Parsers/ExpressionParser/ExpressionParser.DataExchange.cs` - Check Settings.UseVirtualPaths in Write() to determine destination

### Server (VSCode Extension Context)
- Server communication layer - Implement CalcpadStore read/write via client requests
- Server initialization - Set Settings.UseVirtualPaths = true for VSCode extension context
- Server calculation handler - When UseVirtualPaths=true, send MacroParser.ExportedStrings and ExpressionParser.ExportedMatrices to client after calculation

## Security Considerations

- **No arbitrary JavaScript execution** - Only key lookup in predefined globals
- **Fixed syntax** - `<calcpadStore:key>` and `<export:key>` prevents injection attacks
- **Separate export collections** - Server-side ExportedStrings and ExportedMatrices prevent accidental overwrite of internal data
- **Client-server isolation** - Export data only sent to client after calculation completes
- **Thread safety** - Async/await patterns for client-server communication

## Future Enhancements

1. String manipulation functions (substring, replace, split, join)
2. CSV/JSON parsing functions (parse_csv(), parse_json())
3. CalcpadStore metadata access (__keys__, __size__)
4. localStorage integration (`<localStorage:key>`)
5. Reactive updates (auto-reload on CalcpadStore changes)
6. Client-side access to exports via unified window.calcpadExports object containing both strings and matrices
