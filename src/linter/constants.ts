// Common regex patterns used throughout the linter
export const IDENTIFIER_CHARS = 'a-zA-Zα-ωΑ-Ω°øØ∡0-9_,′″‴⁗⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻$';
export const IDENTIFIER_START_CHARS = 'a-zA-Zα-ωΑ-Ω°øØ∡';

// Regex patterns for common identifier types
export const PATTERNS = {
    // Basic identifier (variable/function name) - capture full identifier including $ suffix
    identifier: new RegExp(`(?<![${IDENTIFIER_CHARS}])([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*)(?![${IDENTIFIER_CHARS}])`, 'g'),

    // Variable assignment pattern
    variableAssignment: new RegExp(`^([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*)\\s*=`),

    // Function definition pattern
    functionDefinition: new RegExp(`^([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*)\\s*\\(([^)]*)\\)\\s*=`),

    // Macro name pattern (with optional $)
    macroName: new RegExp(`([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*\\$?)`),

    // Macro call pattern
    macroCall: new RegExp(`\\b([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*\\$)(?:\\(([^)]*)\\))?`, 'g'),

    // Inline macro definition
    inlineMacroDef: new RegExp(`#def\\s+([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*)(?:\\(([^)]*)\\))?\\s*=\\s*(.+)`),

    // Multiline macro definition
    multilineMacroDef: new RegExp(`#def\\s+([${IDENTIFIER_START_CHARS}][${IDENTIFIER_CHARS}]*)(?:\\(([^)]*)\\))?\\s*$`)
};

// Common constants
export const COMMON_CONSTANTS = new Set(['e', 'pi', 'π', 'i', 'j']);
export const SUGGESTION_THRESHOLD = 2; // Max edit distance for suggestions

// Built-in functions from the Calcpad language
export const BUILT_IN_FUNCTIONS = new Set([
    // Basic math
    'abs', 'mod', 'gcd', 'lcm', 'sign', 'random',
    // Trigonometric
    'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
    'asin', 'acos', 'atan', 'atan2', 'acsc', 'asec', 'acot',
    // Hyperbolic
    'sinh', 'cosh', 'tanh', 'csch', 'sech', 'coth',
    'asinh', 'acosh', 'atanh', 'acsch', 'asech', 'acoth',
    // Logarithmic and exponential
    'log', 'ln', 'log_2', 'exp', 'sqr', 'sqrt', 'cbrt', 'root',
    // Rounding
    'round', 'floor', 'ceiling', 'trunc',
    // Complex numbers
    're', 'im', 'phase',
    // Aggregate functions
    'min', 'max', 'sum', 'sumsq', 'srss', 'product', 'average', 'mean',
    // Conditional and logical
    'if', 'switch', 'not', 'and', 'or', 'xor',
    // Interpolation
    'take', 'line', 'spline',
    // Units and high-performance
    'timer', 'hp', 'ishp', 'getunits', 'setunits', 'clrunits',
    // Vector functions
    'vector', 'vector_hp', 'len', 'size', 'fill', 'range', 'range_hp', 'join', 'resize',
    'first', 'last', 'slice', 'sort', 'rsort', 'order', 'revorder', 'reverse', 'extract',
    'search', 'count', 'find', 'find_eq', 'find_ne', 'find_lt', 'find_gt', 'find_le', 'find_ge',
    'lookup', 'lookup_eq', 'lookup_ne', 'lookup_lt', 'lookup_gt', 'lookup_le', 'lookup_ge',
    'norm', 'norm_1', 'norm_2', 'norm_e', 'norm_i', 'norm_p', 'unit', 'dot', 'cross',
    // Matrix functions
    'matrix', 'identity', 'diagonal', 'column', 'utriang', 'ltriang', 'symmetric',
    'vec2diag', 'diag2vec', 'vec2col', 'vec2row',
    'matrix_hp', 'identity_hp', 'diagonal_hp', 'column_hp', 'utriang_hp', 'ltriang_hp', 'symmetric_hp',
    'join_cols', 'join_rows', 'augment', 'stack', 'mfill', 'fill_row', 'fill_col', 'mresize',
    'copy', 'add', 'n_rows', 'n_cols', 'row', 'col', 'extract_rows', 'extract_cols', 'submatrix',
    'mnorm', 'mnorm_2', 'mnorm_e', 'mnorm_1', 'mnorm_i',
    'cond', 'cond_1', 'cond_2', 'cond_e', 'cond_i',
    'det', 'rank', 'transp', 'trace', 'inverse', 'adj', 'cofactor',
    'eigenvals', 'eigenvecs', 'eigen', 'lu', 'qr', 'svd', 'cholesky',
    'lsolve', 'clsolve', 'slsolve', 'msolve', 'cmsolve', 'smsolve',
    'hprod', 'fprod', 'kprod',
    'sort_cols', 'rsort_cols', 'sort_rows', 'rsort_rows',
    'order_cols', 'revorder_cols', 'order_rows', 'revorder_rows',
    'mcount', 'mfind', 'mfind_eq', 'mfind_ne', 'mfind_lt', 'mfind_le', 'mfind_gt', 'mfind_ge', 'msearch',
    'hlookup', 'hlookup_eq', 'hlookup_ne', 'hlookup_lt', 'hlookup_le', 'hlookup_gt', 'hlookup_ge',
    'vlookup', 'vlookup_eq', 'vlookup_ne', 'vlookup_lt', 'vlookup_le', 'vlookup_gt', 'vlookup_ge'
]);

// Control keywords
export const CONTROL_KEYWORDS = new Set([
    'if', 'else', 'else if', 'end if', 'for', 'while', 'repeat', 'loop', 'break', 'continue',
    'rad', 'deg', 'gra',
    'val', 'equ', 'noc', 'round', 'format', 'show', 'hide',
    'varsub', 'nosub', 'novar', 'split', 'wrap', 'pre', 'post',
    'include', 'local', 'global', 'def', 'end def',
    'pause', 'input',
    'md',
    'read', 'write', 'append'
]);

// All valid keywords that can follow #
export const VALID_HASH_KEYWORDS = new Set([
    'if', 'else', 'else if', 'end if', 'rad', 'deg', 'gra', 'val', 'equ', 'noc',
    'round', 'format', 'show', 'hide', 'varsub', 'nosub', 'novar', 'split', 'wrap',
    'pre', 'post', 'repeat', 'for', 'while', 'loop', 'break', 'continue', 'include',
    'local', 'global', 'def', 'end def', 'pause', 'input', 'md', 'read', 'write', 'append'
]);

// Mathematical operators
export const OPERATORS = /[!^\/÷\\⦼*\-+<>≤≥≡≠=∧∨⊕]/;

// Commands
export const PLOT_COMMANDS = new Set(['$plot']);
export const MAP_COMMANDS = new Set(['$map']);
export const SOLVER_COMMANDS = new Set(['$find', '$root', '$sup', '$inf', '$area', '$integral', '$slope']);
export const OTHER_COMMANDS = new Set(['$repeat', '$sum', '$product']);
export const ALL_COMMANDS = new Set([
    ...PLOT_COMMANDS,
    ...MAP_COMMANDS,
    ...SOLVER_COMMANDS,
    ...OTHER_COMMANDS
]);
