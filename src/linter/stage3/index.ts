/**
 * Stage 3 Linting Checks
 *
 * All checks run on fully expanded code (after includes resolved and macros expanded)
 */

// Balance checks
export {
    checkParenthesesBalance,
    checkBracketBalance,
    checkControlBlockBalance
} from './balance';

// Naming checks
export {
    checkVariableNaming,
    checkFunctionDefinition
} from './naming';

// Usage checks
export {
    checkUndefinedVariables,
    checkFunctionUsage,
    checkMacroUsage,
    checkUnitUsage
} from './usage';

// Semantic checks
export {
    checkOperatorSyntax,
    checkCommandUsage,
    validateCommandPatterns,
    checkControlStructures,
    checkKeywordValidation,
    checkAssignments,
    checkUnitsInExpressions
} from './semantic';
