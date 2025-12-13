/**
 * Loads and combines insert data from multiple JSON files
 * Files are loaded in the order specified below
 */

// Import all category JSON files
import * as constantsHeader from './data/insert/constants-header.json';
import * as unitsHeader from './data/insert/units-header.json';
import * as operators from './data/insert/operators.json';
import * as functions from './data/insert/functions.json';
import * as symbols from './data/insert/symbols.json';
import * as programFlowControl from './data/insert/program-flow-control.json';
import * as iteration from './data/insert/iteration.json';
import * as numericalMethod from './data/insert/numerical-method.json';
import * as outputVisibilityControl from './data/insert/output-visibility-control.json';
import * as stringVariableOrMacro from './data/insert/string-variable-or-macro.json';
import * as functionPlot from './data/insert/function-plot.json';
import * as drawingSvg from './data/insert/drawing-svg.json';
import * as html from './data/insert/html.json';
import * as htmlUi from './data/insert/html-ui.json';
import * as dataImportExport from './data/insert/data-import-export.json';

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