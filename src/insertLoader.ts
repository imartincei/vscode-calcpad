/**
 * Loads and combines insert data from multiple JS files
 * Files are loaded in the order specified below
 */

// Import all category data files
import constantsHeader from './data/insert/constants-header.js';
import unitsHeader from './data/insert/units-header.js';
import operators from './data/insert/operators.js';
import functions from './data/insert/functions.js';
import symbols from './data/insert/symbols.js';
import programFlowControl from './data/insert/program-flow-control.js';
import iteration from './data/insert/iteration.js';
import numericalMethod from './data/insert/numerical-method.js';
import outputVisibilityControl from './data/insert/output-visibility-control.js';
import stringVariableOrMacro from './data/insert/string-variable-or-macro.js';
import functionPlot from './data/insert/function-plot.js';
import drawingSvg from './data/insert/drawing-svg.js';
import html from './data/insert/html.js';
import htmlUi from './data/insert/html-ui.js';
import dataImportExport from './data/insert/data-import-export.js';

// Category order - controls the display order in the UI
// To reorder categories, just change the order in this array
const CATEGORIES = [
    constantsHeader,
    unitsHeader,
    operators,
    functions,
    symbols,
    programFlowControl,
    iteration,
    numericalMethod,
    outputVisibilityControl,
    stringVariableOrMacro,
    functionPlot,
    drawingSvg,
    html,
    htmlUi,
    dataImportExport
];

/**
 * Combine all category data in the specified order
 */
function loadInsertData(): Record<string, unknown> {
    const combined: Record<string, unknown> = {};

    // Combine all categories in order
    for (const category of CATEGORIES) {
        Object.assign(combined, category);
    }

    return combined;
}

// Export the combined data as the default export
export default loadInsertData();