# To-Do

## vscode-calcpad

### Enhancements
- Finish enhanced PDF generation
- See if intellisense can be improved
- Implement user defined variable, units, function, and macro definitions using html comment before the #def line (e.g. cmt$({"description": "This macro does this.\nparam1 is the thing..."})). Add tooltip for these that uses the description.
- Implement custom units
- Add duplicate macro definitions to linter
- Test linter for advanced issues
- Add recent features added to Calcpad to linting/insert tab
- Remove final #fetch reference and resolve associated !!! comments
- Add quick typing for macros (~1 macro 1, ~2 macro 2, etc.). Add macro mapping to vscode config using json object {macroMapping:{"1": "macroName$", ...}}. 
- Add hotkeys for HTML/markdown formatting. Add toggle for HTML vs markdown in the settings.
- Add .vscodeignore
- Package extension for further testing within the company. Publish to vsx and Visual Studio Marketplace (under personal account)

### Bugs
[Vue Debug] Vue Error: TypeError: e.getMacroTooltip is not a function - https://vuejs.org/error-reference/#runtime-1

## Calcpad.Server
- Test new URL structure from Calcpad.Core.
- Finish adding CalcpadS3 and CalcpadAuth to Calcpad.Server. 
- Make Docker config that allows using MinIO or external S3 provider. 
- Add password or OAuth to Docker. 
- Add cloudflare tunnel config as option in Docker.
- Refactor CalcpadAuth routing to work with <service:endpoint> structure and make router.json config to work with any API calls (such as GET vs POST and auth/content type headers). Body is passed from Calcpad itself.
- Add token management config with auth endpoints for various tokens. MAKE SURE TOKENS ARE ONLY STORED IN SERVER MEMORY AND SELECTED BASED ON CONFIG SETTINGS. Use handlerbars {{jwt.calcpad}} syntax to select which token to use in API calls. This is the only time handlebars are needed (anything only in server program memory), as all other params should be passed from Calcpad as JSON in the body of the request.
- Add getting JS variables as string
- Add string functions to MacroParser. See Github issue.