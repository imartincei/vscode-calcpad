# To-Do

## vscode-calcpad

### Enhancements
- Finish enhanced PDF generation
- Add search in output HTML
- Re-factor builtins and function signatures to serve purposes for both linting and passing info to the Insert tab in VS Code. Add an endpoint to get the built-ins data as a one-time startup operation once the server is connected.
- See if intellisense can be improved
- Implement user defined variable, units, function, and macro definitions using html comment before the #def line (e.g. cmt$({"description": "This macro does this.\nparam1 is the thing..."})). Add tooltip for these that uses the description.
- Test linter for advanced issues
    - Macros get flagged with undefined variable when a parameter is set in a macro
    - Macros with strings get interpreted as a unit
    - ignore some checks in include and read parameters (and add proper checks)
- Add quick typing for macros (~1 macro 1, ~2 macro 2, etc.). Add macro mapping to vscode config using json object {macroMapping:{"1": "macroName$", ...}}. Have VS code set cursor position to within () and before first param.
- Add hotkeys for HTML/markdown formatting. Add toggle for HTML vs markdown in the settings.
- Package extension for further testing within the company. Publish to Open VSX but not Visual Studio Marketplace unless I need a personal Azure account for other reasons
- Add more line continuation logic per 7.5.1/7.5.2: Left bracket '(' is enabled to serve as line continuation, besides '{' and ';' and without the need to add ' _' symbol at the end of the line. Made all opening brackets and delimiters to be line continuation symbols.
- Refactor tokens to use all colors for different ones.
- Remove warning for unicode symbols in variable names (e.g. ℓ and ρ)
- Fix line links to use source line mapping
- Add refactoring

### Bugs
- Fix include reading around #{0}... syntax - test fix
- Fix insert reload to occur when server refreshes - test fix
- Add refresh when settings are changed.

## Calcpad.Server
- Finish adding CalcpadAuth to Calcpad.Server.
- CalcpadS3 should remain its own project (with a frontend built into vs code). However, make config in Calcpad.Core that allows #include and #read to directly pull files from s3. Example: #include myfile.cpd should check 1. Local files, 2. File cache sent from client. 3. CalcpadS3 if config is available.
- Write/Append should prompt a ZIP download when using Calcpad.Server with the Linux build rather than appending to the local filepath (for Docker, this makes no sense). However, for Windows build, it works as-is. Make an endpoint to do this and add a button to vscode. Add an ENV variable to control the behavior. In addition, add a setting to Calcpad.Core to control if write/append content is cached for download or directly affecting files.
- Make Docker config that allows using MinIO or external S3 provider. 
- Add password or OAuth to Docker.
- Add cloudflare tunnel config as option in Docker.
- Note that Windows version will only support localhost with no auth, S3, or custom routing.
- Refactor CalcpadAuth routing to work with <service:endpoint> structure and make router.json config to work with any API calls (such as GET vs POST and auth/content type headers). Body is passed from Calcpad itself.
- Add token management config with auth endpoints for various tokens. MAKE SURE TOKENS ARE ONLY STORED IN SERVER MEMORY AND SELECTED BASED ON CONFIG SETTINGS. Use handlebars {{jwt.calcpad}} syntax to select which token to use in API calls. This is the only time handlebars are needed (anything only in server program memory), as all other params should be passed from Calcpad as JSON in the body of the request.
- Add getting JS variables as string
- Add string functions to MacroParser. See Github issue.
- Docker and include could work by vs code sending file bytes of included files to Calcpad.Server and changing the path (#include myfile.cpd to #include [GUID]). Then the server can cache the bytes and retrieve it by GUID. The cache is cleared each time convert is run.
- Test Windows build with esbuild instead of caxa
- Make keyword arguments in functions and macros. If a keyword argument is used, have the linter check the macro against the default values for type mismatch errors.

### Bugs


### Testing

- Test snippet updates


## Calcpad.Highlighter
- Double check builtin function return types are correct. Have Claude run the comprehensive check to see what is returned.
- Have the linter check when a macro parameter is used as a string and do type checking in this case.
- Add parsing of metadata lines for macro descriptions and parameter descriptions/type hinting. Metadata lines contain inline or multiline JSON that external programs can pull from cpd files but are ignored by the parser. Metadata lines occur when there is JSON in an HTML comment
- Design snippet nomenclature for polymorphic functions (take, line, spline) - functions accepting different types (scalar/vector/matrix)
- Test snippets and linter
- Fix max, min, etc. to work with values, vectors, and matricies. Vectors and Matrices are expanded as values.
- Verify all functions/features are present in snippets and they are implemented correctly.
- Improve linting for commands $Repeat{i*j @90 i=1:10} should be invalid
- Add tokenization of JS, CSS, and SVG in comments. Tokenize HTML within tags differently than comments.
- Add property to use snippet as a keyword for the linter or if it just needs passed as example syntax to the UI.
- Add incomplete expression linting (w_D,ext = )
- Add unused variable warning

### Bugs

- Fix tokenizer to detect variables and units in expressions with macros:
Wt_DAF = 2*37.5kipnote$('Weight of both DAF units')
P_D = -Wt_DAFnote$('Dead Load')
- Fix multiple assignments check to only apply when there is not strings between variable definitions

## Calcpad.Wpf

### Bugs

## Calcpad.Core

- Use task instead of async for read operations - Completed but NEEDS TESTED