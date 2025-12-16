# To-Do

## vscode-calcpad

### Enhancements
- Finish enhanced PDF generation
- See if intellisense can be improved
- Implement user defined variable, units, function, and macro definitions using html comment before the #def line (e.g. cmt$({"description": "This macro does this.\nparam1 is the thing..."})). Add tooltip for these that uses the description.
- Test linter for advanced issues
    - Macros get flagged with undefined variable when a parameter is set in a macro
    - Macros with strings get interpreted as a unit
    - ignore some checks in include and read parameters (and add proper checks)
- Add recent features added to Calcpad to linting/insert tab
    -Inline and Block, HP vectors/matricies, markdown, find anything else that might be missing
- Remove final #fetch reference and resolve associated !!! comments
- Add quick typing for macros (~1 macro 1, ~2 macro 2, etc.). Add macro mapping to vscode config using json object {macroMapping:{"1": "macroName$", ...}}. Have VS code set cursor position to within () and before first param.
- Add hotkeys for HTML/markdown formatting. Add toggle for HTML vs markdown in the settings.
- Package extension for further testing within the company. Publish to Open VSX but not Visual Studio Marketplace unless I need a personal Azure account for other reasons
- Add more line continuation logic per 7.5.1/7.5.2: Left bracket '(' is enabled to serve as line continuation, besides '{' and ';' and without the need to add ' _' symbol at the end of the line. Made all opening brackets and delimiters to be line continuation symbols.

### Bugs
Ignore custom units in undefined variable checks

## Calcpad.Server
- Finish adding CalcpadS3 and CalcpadAuth to Calcpad.Server. 
- Make Docker config that allows using MinIO or external S3 provider. 
- Add password or OAuth to Docker. 
- Add cloudflare tunnel config as option in Docker.
- Note that Windows version will only support localhost with no auth, S3, or custom routing. It is intended f
- Refactor CalcpadAuth routing to work with <service:endpoint> structure and make router.json config to work with any API calls (such as GET vs POST and auth/content type headers). Body is passed from Calcpad itself.
- Add token management config with auth endpoints for various tokens. MAKE SURE TOKENS ARE ONLY STORED IN SERVER MEMORY AND SELECTED BASED ON CONFIG SETTINGS. Use handlebars {{jwt.calcpad}} syntax to select which token to use in API calls. This is the only time handlebars are needed (anything only in server program memory), as all other params should be passed from Calcpad as JSON in the body of the request.
- Add getting JS variables as string
- Add string functions to MacroParser. See Github issue.
- Pass the source mapping from Calcpad.Server/Calcpad.Core to vscode as the logic is already built into this. Use highlighter as an example of some aspects.
- The merge from the calcpad-s3-pr branch didn't work as expected. Manually add the relevant changes that were required to get it to work to the latest version and make a PR. DO THIS BEFORE MAKING ANY OTHER CHANGES TO CALCPAD VM.

### Bugs
