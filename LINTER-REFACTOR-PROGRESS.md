# Three-Stage Linter Refactoring - Progress Report

## ✅ Completed Work

### Phase 1: Content Resolver (COMPLETE)
**File**: `src/calcpadContentResolver.ts`
- ✅ Added `StagedResolvedContent` interface
- ✅ Implemented `getStagedContent()` - orchestrates all three stages
- ✅ Implemented `processStage1()` - processes line continuations only
- ✅ Implemented `processStage2()` - resolves #include, collects macros (no expansion)
- ✅ Implemented `processStage3()` - expands macros, collects all definitions
- ✅ Old `getCompiledContent()` preserved for backward compatibility

### Phase 2: Type Definitions (COMPLETE)
**File**: `src/types/calcpad.ts`
- ✅ Re-exported `StagedResolvedContent` from calcpadContentResolver

### Phase 3-5: Modular Linter Architecture (COMPLETE)
Created organized folder structure: `src/linter/`

**File**: `src/linter/types.ts`
- ✅ `DefinitionCollector` interface
- ✅ `ParsedLine` interface
- ✅ `DiagnosticWithCode` interface
- ✅ `MacroContext` interface

**File**: `src/linter/constants.ts`
- ✅ All identifier patterns and regex
- ✅ Built-in functions list (~100+ functions)
- ✅ Control keywords
- ✅ Valid hash keywords
- ✅ Operators and commands

**File**: `src/linter/helpers.ts`
- ✅ `isEmptyOrComment()` - line checking
- ✅ `splitParameters()` / `countParameters()` - parameter parsing
- ✅ `createDiagnosticWithCode()` - creates diagnostics with both prefix and code property
- ✅ `mapStage2ToOriginal()` - cascading source map for Stage 2
- ✅ `mapStage3ToOriginal()` - cascading source map for Stage 3
- ✅ `extractCodeAndStrings()` - separates code from string literals
- ✅ `findMacroCallRange()` - locates macro calls for error highlighting
- ✅ `levenshteinDistance()` / `findSuggestions()` - suggestion engine

### Phase 6: Stage 1 Linter (COMPLETE)
**File**: `src/linter/stage1.ts`
- ✅ `lintStage1()` - main entry point
- ✅ `checkIncludeSyntax()` - validates #include statements
- ✅ Error codes implemented:
  - CPD-1101: Malformed #include statement
  - CPD-1102: Invalid #include file path
  - CPD-1103: Missing #include filename

### Phase 7: Stage 2 Linter (COMPLETE)
**File**: `src/linter/stage2.ts`
- ✅ `lintStage2()` - main entry point with control block tracking
- ✅ Duplicate macro error reporting (from stage2.duplicateMacros)
- ✅ `checkMacroDefinitionSyntax()` - validates #def syntax
- ✅ Macro block balance checking (#def/#end def)
- ✅ Nested macro detection
- ✅ Macro-in-control-block warnings
- ✅ **Correct CalcPad loop syntax**:
  - `#if ... #end if`
  - `#repeat ... #loop`
  - `#for ... #loop`
  - `#while ... #loop`
- ✅ Error codes implemented:
  - CPD-2201: Duplicate macro definition
  - CPD-2202: Macro name missing $ suffix (ERROR - required)
  - CPD-2203: Macro parameter missing $ suffix (ERROR - required)
  - CPD-2204: Invalid macro name
  - CPD-2205: Malformed #def syntax
  - CPD-2206: #end def without matching #def
  - CPD-2207: Nested macro definition
  - CPD-2208: Invalid macro parameter syntax
  - CPD-2209: Macro definition inside control block (WARNING)

### Phase 8a: Stage 3 Balance Checks (COMPLETE)
**File**: `src/linter/stage3/balance.ts`
- ✅ `checkParenthesesBalance()` - CPD-3101, CPD-3102
- ✅ `checkBracketBalance()` - CPD-3103, CPD-3104, CPD-3105, CPD-3106
- ✅ `checkControlBlockBalance()` - CPD-3105
  - Runs on Stage 3 (after macro expansion)
  - Handles macros containing control blocks
  - **Correct CalcPad syntax**: all loops close with `#loop`

---

### Phase 8b: Stage 3 Naming Checks (COMPLETE)
**File**: `src/linter/stage3/naming.ts`
- ✅ `checkVariableNaming()` - CPD-3201, CPD-3202, CPD-3205
- ✅ `checkFunctionDefinition()` - CPD-3203, CPD-3204

### Phase 8c: Stage 3 Usage Checks (COMPLETE)
**File**: `src/linter/stage3/usage.ts`
- ✅ `checkUndefinedVariables()` - CPD-3301 with suggestions
- ✅ `checkFunctionUsage()` - CPD-3302 (parameter count validation)
- ✅ `checkMacroUsage()` - CPD-3303, CPD-3304
- ✅ `checkUnitUsage()` - CPD-3305

### Phase 8d: Stage 3 Semantic Checks (COMPLETE)
**File**: `src/linter/stage3/semantic.ts`
- ✅ `checkOperatorSyntax()` - CPD-3401, CPD-3402
- ✅ `checkCommandUsage()` - CPD-3403
- ✅ `validateCommandPatterns()` - CPD-3404
- ✅ `checkControlStructures()` - CPD-3405
- ✅ `checkKeywordValidation()` - CPD-3406
- ✅ `checkAssignments()` - CPD-3407
- ✅ `checkUnitsInExpressions()` - CPD-3408

### Phase 8e: Stage 3 Index (COMPLETE)
**File**: `src/linter/stage3/index.ts`
- ✅ Exports all Stage 3 check functions

### Phase 9: Main Orchestrator (COMPLETE)
**File**: `src/calcpadLinterStaged.ts`
- ✅ `CalcpadLinterStaged` class created
- ✅ `lintDocument()` method - orchestrates all three stages
- ✅ `lintStage3()` method - runs all Stage 3 checks
- ✅ `createDefinitionCollector()` - builds collector from Stage 3 data
- ✅ `getContentResolver()` - accessor method
- ✅ Constructor matches old linter signature

### Phase 10: Integration (COMPLETE)
**File**: `src/extension.ts`
- ✅ Imported `CalcpadLinterStaged`
- ✅ Updated type declaration: `let linter: CalcpadLinterStaged`
- ✅ Updated instantiation: `linter = new CalcpadLinterStaged(settingsManager)`

---

## 📋 Remaining Work

### Phase 11: Testing (PENDING - READY TO TEST)
- Test with simple CPD files
- Test with #include
- Test with macros
- Test with both #include and macros
- Verify error codes display correctly
- Test edge cases

### Phase 12: Cleanup (PENDING)
- Delete `src/calcpadLinter.ts` (old file)
- Remove `getCompiledContent()` from calcpadContentResolver.ts
- Optional: Rename `calcpadLinterStaged.ts` → `calcpadLinter.ts`

---

## Architecture Summary

### Modular Structure
```
src/
  linter/
    types.ts              ✅ Interfaces and type definitions
    constants.ts          ✅ Built-in functions, keywords, operators
    helpers.ts            ✅ Helper functions (source mapping, error codes)
    stage1.ts             ✅ Stage 1: #include syntax checks
    stage2.ts             ✅ Stage 2: Macro definition checks
    stage3/
      balance.ts          ✅ Parentheses, brackets, control blocks
      naming.ts           ✅ Variable/function naming
      usage.ts            ✅ Undefined variables, function usage
      semantic.ts         ✅ Operators, commands, control structures
      index.ts            ✅ Export all Stage 3 checks
  calcpadLinterStaged.ts  ✅ Main orchestrator
  calcpadContentResolver.ts ✅ Staged content resolution
  extension.ts            ✅ Integration complete
```

### Three-Stage Pipeline
1. **Stage 1**: Raw CPD → Process line continuations → Check #include syntax
2. **Stage 2**: Resolve #include → Collect macros (no expansion) → Check macro definitions
3. **Stage 3**: Expand macros → Run all checks on unwrapped code

### Error Code Format
- **Format**: `CPD-{Stage}{Category}{Number}`
- **Display**: Both prefix `[CPD-XXXX]` and VS Code code property
- **Stages**: 1 (raw), 2 (post-include), 3 (expanded)
- **Categories**: 1xx (syntax), 2xx (naming), 3xx (usage), 4xx (semantic)

---

## Next Steps

1. Commit current progress (Phases 1-8a complete)
2. Continue with Stage 3 modules (naming, usage, semantic)
3. Create main orchestrator
4. Integrate with extension
5. Test and verify
6. Clean up old code
