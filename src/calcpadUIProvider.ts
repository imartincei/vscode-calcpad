import * as vscode from 'vscode';
import { CalcpadSettingsManager, CalcpadSettings } from './calcpadSettings';
import { CalcpadInsertManager, InsertItem } from './calcpadInsertManager';

export class CalcpadUIProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'calcpadUI';

    private _view?: vscode.WebviewView;
    private _settingsManager: CalcpadSettingsManager;
    private _insertManager: CalcpadInsertManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { 
        this._settingsManager = CalcpadSettingsManager.getInstance();
        this._insertManager = CalcpadInsertManager.getInstance();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'insertText':
                        this.insertTextAtCursor(message.text);
                        break;
                    case 'updateSettings':
                        this._settingsManager.updateSettings(message.settings);
                        break;
                    case 'resetSettings':
                        this._settingsManager.resetSettings();
                        webviewView.webview.postMessage({
                            type: 'settingsReset',
                            settings: this._settingsManager.getSettings()
                        });
                        break;
                    case 'getSettings':
                        webviewView.webview.postMessage({
                            type: 'settingsResponse',
                            settings: this._settingsManager.getSettings()
                        });
                        break;
                }
            },
            undefined
        );
    }

    private insertTextAtCursor(text: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = editor.selection.active;
            editor.edit(editBuilder => {
                editBuilder.insert(position, text);
            });
        }
    }

    public getSettingsManager(): CalcpadSettingsManager {
        return this._settingsManager;
    }

    public getInsertManager(): CalcpadInsertManager {
        return this._insertManager;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const allItems = this._insertManager.getAllItems();
        const insertData = this._insertManager.getInsertData();
        const insertDataString = JSON.stringify(insertData);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CalcPad UI</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            overflow: hidden;
        }
        
        .calcpad-ui {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        
        .tab-container {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-tab-unfocusedActiveBackground);
        }
        
        .tab {
            padding: 8px 16px;
            background: var(--vscode-tab-inactiveBackground);
            border: none;
            color: var(--vscode-tab-inactiveForeground);
            cursor: pointer;
            font-size: 12px;
            border-right: 1px solid var(--vscode-panel-border);
        }
        
        .tab.active {
            background: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
        }
        
        .tab:hover:not(.active) {
            background: var(--vscode-tab-hoverBackground);
        }
        
        .tab-content {
            display: none;
            flex: 1;
            overflow-y: scroll;
            overflow-x: hidden;
            flex-direction: column;
            padding: 8px;
        }
        
        .tab-content.active {
            display: flex;
        }
        
        /* Tree structure styles */
        .tree {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        
        .tree li {
            list-style: none;
            margin: 0;
            padding: 0;
            position: relative;
        }
        
        .tree-section {
            position: relative;
        }
        
        .tree-section > input[type="checkbox"] {
            position: absolute;
            left: -9999px;
            opacity: 0;
        }
        
        .tree-section > label {
            display: block;
            padding: 8px 12px;
            background: var(--vscode-sideBarSectionHeader-background);
            color: var(--vscode-sideBarSectionHeader-foreground);
            cursor: pointer;
            user-select: none;
            font-weight: bold;
            font-size: 12px;
            border: none;
            position: relative;
            transition: background-color 0.2s ease;
        }
        
        .tree-section > label:hover {
            background: var(--vscode-list-hoverBackground);
        }
        
        .tree-section > label:before {
            content: '▶';
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            transition: transform 0.2s ease;
            font-size: 0.8em;
        }
        
        .tree-section > label {
            padding-left: 28px;
        }
        
        .tree-section > input[type="checkbox"]:checked + label:before {
            transform: translateY(-50%) rotate(90deg);
        }
        
        .tree-section > ul {
            display: none;
            list-style: none;
            margin: 0;
            padding: 0;
            background: var(--vscode-editor-background);
        }
        
        .tree-section > input[type="checkbox"]:checked + label + ul {
            display: block;
        }
        
        .tree-section.level-1 > label {
            padding-left: 44px;
            font-size: 11px;
            font-weight: normal;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
        }
        
        .tree-section.level-1 > label:before {
            left: 24px;
        }
        
        .tree-section.level-2 > label {
            padding-left: 60px;
            font-size: 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            opacity: 0.9;
        }
        
        .tree-section.level-2 > label:before {
            left: 40px;
        }
        
        .tree-section.level-3 > label {
            padding-left: 76px;
            font-size: 9px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            opacity: 0.8;
        }
        
        .tree-section.level-3 > label:before {
            left: 56px;
        }
        
        .tree-section.level-4 > label {
            padding-left: 92px;
            font-size: 9px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            opacity: 0.7;
        }
        
        .tree-section.level-4 > label:before {
            left: 72px;
        }
        
        .tree-item {
            display: block;
            width: 100%;
            padding: 4px 12px 4px 28px;
            background: transparent;
            border: none;
            color: var(--vscode-input-foreground);
            cursor: pointer;
            text-align: left;
            font-size: 11px;
            transition: background-color 0.2s ease;
        }
        
        .tree-item:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .level-1 .tree-item {
            padding-left: 44px;
        }
        
        .level-2 .tree-item {
            padding-left: 60px;
        }
        
        .level-3 .tree-item {
            padding-left: 76px;
        }
        
        .level-4 .tree-item {
            padding-left: 92px;
        }
        
        /* Settings tab styles */
        .settings-container {
            padding: 12px;
            overflow-y: auto;
            height: 100%;
        }
        
        .settings-container h3 {
            margin: 16px 0 8px 0;
            color: var(--vscode-sideBarSectionHeader-foreground);
            font-size: 13px;
            font-weight: bold;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 4px;
        }
        
        .settings-container h3:first-child {
            margin-top: 0;
        }
        
        .setting-group {
            margin-bottom: 12px;
        }
        
        .setting-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-input-foreground);
            font-weight: normal;
        }
        
        .setting-group input[type="number"],
        .setting-group select {
            width: 100%;
            padding: 6px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-size: 12px;
        }
        
        .setting-group input[type="checkbox"] {
            margin-right: 8px;
            background: var(--vscode-checkbox-background);
            border: 1px solid var(--vscode-checkbox-border);
        }
        
        .setting-group label:has(input[type="checkbox"]) {
            display: flex;
            align-items: center;
            cursor: pointer;
        }
        
        .reset-button {
            width: 100%;
            padding: 8px;
            background: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 16px;
        }
        
        .reset-button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="calcpad-ui">
        <div class="tab-container">
            <button class="tab active" onclick="switchTab('insert-tab')">Insert</button>
            <button class="tab" onclick="switchTab('settings-tab')">Settings</button>
        </div>
        
        <div class="tab-content active" id="insert-tab">
            <div id="insert-container"></div>
        </div>
        
        <div class="tab-content" id="settings-tab">
            <div class="settings-container">
                <h3>Math Settings</h3>
                <div class="setting-group">
                    <label for="decimals">Decimal Places:</label>
                    <input type="number" id="decimals" min="0" max="15" value="6">
                </div>
                <div class="setting-group">
                    <label for="degrees">Angle Units:</label>
                    <select id="degrees">
                        <option value="0">Degrees</option>
                        <option value="1">Radians</option>
                        <option value="2">Gradians</option>
                    </select>
                </div>
                <div class="setting-group">
                    <label for="isComplex">
                        <input type="checkbox" id="isComplex"> Enable Complex Numbers
                    </label>
                </div>
                <div class="setting-group">
                    <label for="substitute">
                        <input type="checkbox" id="substitute" checked> Show Variable Substitution
                    </label>
                </div>
                <div class="setting-group">
                    <label for="formatEquations">
                        <input type="checkbox" id="formatEquations" checked> Format Equations
                    </label>
                </div>
                
                <h3>Plot Settings</h3>
                <div class="setting-group">
                    <label for="isAdaptive">
                        <input type="checkbox" id="isAdaptive" checked> Adaptive Plotting
                    </label>
                </div>
                <div class="setting-group">
                    <label for="screenScaleFactor">Screen Scale Factor:</label>
                    <input type="number" id="screenScaleFactor" min="0.5" max="4" step="0.1" value="2">
                </div>
                <div class="setting-group">
                    <label for="vectorGraphics">
                        <input type="checkbox" id="vectorGraphics"> Use Vector Graphics
                    </label>
                </div>
                <div class="setting-group">
                    <label for="colorScale">Color Scale:</label>
                    <select id="colorScale">
                        <option value="Rainbow">Rainbow</option>
                        <option value="Grayscale">Grayscale</option>
                        <option value="Hot">Hot</option>
                        <option value="Cool">Cool</option>
                        <option value="Jet">Jet</option>
                        <option value="Parula">Parula</option>
                    </select>
                </div>
                <div class="setting-group">
                    <label for="smoothScale">
                        <input type="checkbox" id="smoothScale"> Smooth Color Transitions
                    </label>
                </div>
                <div class="setting-group">
                    <label for="shadows">
                        <input type="checkbox" id="shadows" checked> Enable 3D Shadows
                    </label>
                </div>
                <div class="setting-group">
                    <label for="lightDirection">Light Direction:</label>
                    <select id="lightDirection">
                        <option value="North">North</option>
                        <option value="NorthEast">North East</option>
                        <option value="East">East</option>
                        <option value="SouthEast">South East</option>
                        <option value="South">South</option>
                        <option value="SouthWest">South West</option>
                        <option value="West">West</option>
                        <option value="NorthWest" selected>North West</option>
                    </select>
                </div>
                
                <h3>Units & Output</h3>
                <div class="setting-group">
                    <label for="units">Unit System:</label>
                    <select id="units">
                        <option value="m">Metric</option>
                        <option value="i">Imperial</option>
                        <option value="u">US</option>
                    </select>
                </div>
                <div class="setting-group">
                    <label for="outputFormat">Output Format:</label>
                    <select id="outputFormat">
                        <option value="html">HTML</option>
                        <option value="pdf">PDF</option>
                        <option value="docx">DOCX</option>
                    </select>
                </div>
                <div class="setting-group">
                    <label for="silent">
                        <input type="checkbox" id="silent" checked> Silent Mode
                    </label>
                </div>
                
                <div class="setting-group">
                    <button id="reset-settings" class="reset-button">Reset to Defaults</button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script>
        const { createApp } = Vue;
        const vscode = acquireVsCodeApi();
        const insertData = ${insertDataString};
        
        function switchTab(tabId) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab content
            document.getElementById(tabId).classList.add('active');
            
            // Add active class to clicked tab
            event.target.classList.add('active');
        }
        
        // Settings management
        const defaultSettings = {
            math: {
                decimals: 6,
                degrees: 0,
                isComplex: false,
                substitute: true,
                formatEquations: true
            },
            plot: {
                isAdaptive: true,
                screenScaleFactor: 2,
                imagePath: "",
                imageUri: "",
                vectorGraphics: false,
                colorScale: "Rainbow",
                smoothScale: false,
                shadows: true,
                lightDirection: "NorthWest"
            },
            units: "m",
            output: {
                format: "html",
                silent: true
            }
        };
        
        function getSettings() {
            return {
                math: {
                    decimals: parseInt(document.getElementById('decimals').value),
                    degrees: parseInt(document.getElementById('degrees').value),
                    isComplex: document.getElementById('isComplex').checked,
                    substitute: document.getElementById('substitute').checked,
                    formatEquations: document.getElementById('formatEquations').checked
                },
                plot: {
                    isAdaptive: document.getElementById('isAdaptive').checked,
                    screenScaleFactor: parseFloat(document.getElementById('screenScaleFactor').value),
                    imagePath: "",
                    imageUri: "",
                    vectorGraphics: document.getElementById('vectorGraphics').checked,
                    colorScale: document.getElementById('colorScale').value,
                    smoothScale: document.getElementById('smoothScale').checked,
                    shadows: document.getElementById('shadows').checked,
                    lightDirection: document.getElementById('lightDirection').value
                },
                units: document.getElementById('units').value,
                output: {
                    format: document.getElementById('outputFormat').value,
                    silent: document.getElementById('silent').checked
                }
            };
        }
        
        function loadSettings(settings) {
            document.getElementById('decimals').value = settings.math.decimals;
            document.getElementById('degrees').value = settings.math.degrees;
            document.getElementById('isComplex').checked = settings.math.isComplex;
            document.getElementById('substitute').checked = settings.math.substitute;
            document.getElementById('formatEquations').checked = settings.math.formatEquations;
            
            document.getElementById('isAdaptive').checked = settings.plot.isAdaptive;
            document.getElementById('screenScaleFactor').value = settings.plot.screenScaleFactor;
            document.getElementById('vectorGraphics').checked = settings.plot.vectorGraphics;
            document.getElementById('colorScale').value = settings.plot.colorScale;
            document.getElementById('smoothScale').checked = settings.plot.smoothScale;
            document.getElementById('shadows').checked = settings.plot.shadows;
            document.getElementById('lightDirection').value = settings.plot.lightDirection;
            
            document.getElementById('units').value = settings.units;
            document.getElementById('outputFormat').value = settings.output.format;
            document.getElementById('silent').checked = settings.output.silent;
        }
        
        function resetSettings() {
            vscode.postMessage({
                type: 'resetSettings'
            });
        }
        
        function saveSettings() {
            const settings = getSettings();
            vscode.postMessage({
                type: 'updateSettings',
                settings: settings
            });
        }
        
        function setupSettingsEvents() {
            // Auto-save settings when they change
            const inputs = document.querySelectorAll('#settings-tab input, #settings-tab select');
            inputs.forEach(input => {
                input.addEventListener('change', saveSettings);
            });
            
            // Reset button
            document.getElementById('reset-settings').addEventListener('click', resetSettings);
        }
        
        function initializeSettings() {
            // Request current settings from extension
            vscode.postMessage({
                type: 'getSettings'
            });
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'settingsResponse':
                    loadSettings(message.settings);
                    break;
                case 'settingsReset':
                    loadSettings(message.settings);
                    break;
            }
        });
        
        // Initialize Insert Tab using Vue.js
        createApp({
            data() {
                return {
                    insertData: insertData,
                    allItems: [],
                    searchTerm: '',
                    filteredItems: []
                }
            },
            mounted() {
                this.initializeItems();
                this.setupSearch();
                this.buildTreeStructure();
            },
            methods: {
                initializeItems() {
                    this.allItems = [];
                    this.flattenItems(this.insertData, [], this.allItems);
                },
                buildTreeStructure() {
                    // This will be handled in the template
                },
                flattenItems(data, currentPath, result) {
                    Object.keys(data).forEach(categoryKey => {
                        const categoryData = data[categoryKey];
                        const newPath = [...currentPath, categoryKey];
                        
                        if (Array.isArray(categoryData)) {
                            categoryData.forEach(item => {
                                result.push({
                                    ...item,
                                    categoryPath: newPath.join(' > ')
                                });
                            });
                        } else if (typeof categoryData === 'object') {
                            if (categoryData.direct && Array.isArray(categoryData.direct)) {
                                categoryData.direct.forEach(item => {
                                    result.push({
                                        ...item,
                                        categoryPath: newPath.join(' > ')
                                    });
                                });
                            }
                            
                            Object.keys(categoryData).forEach(subKey => {
                                if (subKey !== 'direct') {
                                    const subData = { [subKey]: categoryData[subKey] };
                                    this.flattenItems(subData, newPath, result);
                                }
                            });
                        }
                    });
                },
                setupSearch() {
                    const searchInput = document.getElementById('search-input');
                    if (searchInput) {
                        searchInput.addEventListener('input', (e) => {
                            this.searchTerm = e.target.value;
                            this.filterItems();
                        });
                    }
                },
                filterItems() {
                    if (!this.searchTerm.trim()) {
                        this.filteredItems = [];
                        return;
                    }
                    
                    const term = this.searchTerm.toLowerCase();
                    
                    const itemMatches = this.allItems.filter(item => 
                        item.label?.toLowerCase().includes(term) ||
                        item.tag?.toLowerCase().includes(term) ||
                        item.description?.toLowerCase().includes(term)
                    );
                    
                    const categoryMatches = this.allItems.filter(item => 
                        item.categoryPath?.toLowerCase().includes(term) &&
                        !itemMatches.includes(item)
                    );
                    
                    this.filteredItems = [...itemMatches, ...categoryMatches];
                },
                insertItem(item) {
                    vscode.postMessage({
                        type: 'insertText',
                        text: item.tag
                    });
                },
                collapseAll() {
                    // Find all checkboxes in the tree and uncheck them
                    const checkboxes = document.querySelectorAll('#tree-container input[type="checkbox"]');
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = false;
                    });
                },
                getDisplayText(item) {
                    return item.label ? item.label + ' - ' + item.description : item.description;
                }
            },
            template: \`
                <div>
                    <input 
                        id="search-input"
                        type="text" 
                        placeholder="Search items..." 
                        style="width: 100%; margin-bottom: 8px; padding: 8px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 12px;"
                        v-model="searchTerm"
                        @input="filterItems"
                    />
                    
                    <!-- Tree view when no search -->
                    <div v-if="!searchTerm.trim()">
                        <button 
                            id="collapse-all-btn"
                            @click="collapseAll"
                            style="width: 100%; margin-bottom: 8px; padding: 6px 8px; background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border); color: var(--vscode-button-secondaryForeground); border-radius: 3px; cursor: pointer; font-size: 11px; transition: background-color 0.2s;"
                            @mouseover="$event.target.style.background = 'var(--vscode-button-secondaryHoverBackground)'"
                            @mouseout="$event.target.style.background = 'var(--vscode-button-secondaryBackground)'"
                        >
                            Collapse All
                        </button>
                        <div id="tree-container"></div>
                    </div>
                    
                    <!-- Search results -->
                    <div v-else-if="filteredItems.length === 0">
                        <p style="text-align: center; opacity: 0.7; font-size: 12px; padding: 16px;">No items found</p>
                    </div>
                    <div v-else>
                        <button 
                            v-for="item in filteredItems" 
                            :key="item.tag"
                            @click="insertItem(item)"
                            :title="item.description"
                            style="display: block; width: 100%; padding: 6px 8px; background: transparent; border: 1px solid transparent; color: var(--vscode-input-foreground); cursor: pointer; border-radius: 2px; text-align: left; font-size: 11px; margin-bottom: 2px; transition: all 0.2s;"
                            @mouseover="$event.target.style.background = 'var(--vscode-button-hoverBackground)'; $event.target.style.borderColor = 'var(--vscode-input-border)'"
                            @mouseout="$event.target.style.background = 'transparent'; $event.target.style.borderColor = 'transparent'"
                        >
                            <div>{{ getDisplayText(item) }}</div>
                            <div v-if="item.categoryPath" style="font-size: 10px; opacity: 0.6; margin-top: 2px; font-style: italic;">
                                {{ item.categoryPath }}
                            </div>
                        </button>
                    </div>
                </div>
            \`
        }).mount('#insert-container');
        
        // Build the tree structure for non-search view
        function buildTreeStructure() {
            const treeContainer = document.getElementById('tree-container');
            if (!treeContainer) return;
            
            const treeRoot = document.createElement('ul');
            treeRoot.className = 'tree';
            treeContainer.appendChild(treeRoot);
            
            buildTreeStructureRecursive(insertData, treeRoot, 0);
        }
        
        function buildTreeStructureRecursive(data, parentUl, level) {
            if (level >= 5) return; // Allow up to level 4 (0-based indexing)
            
            Object.keys(data).forEach(categoryKey => {
                const categoryData = data[categoryKey];
                
                if (Array.isArray(categoryData)) {
                    const groupedData = groupMenuData(categoryData);
                    
                    if (Object.keys(groupedData).length === 1 && groupedData.direct) {
                        const { li, ul } = createTreeSection(categoryKey, level);
                        
                        categoryData.forEach(item => {
                            const itemLi = createTreeItem(item, level);
                            ul.appendChild(itemLi);
                        });
                        
                        parentUl.appendChild(li);
                    } else {
                        const { li, ul } = createTreeSection(categoryKey, level);
                        
                        Object.keys(groupedData).forEach(groupKey => {
                            if (groupKey !== 'direct') {
                                const groupItems = groupedData[groupKey];
                                const { li: subLi, ul: subUl } = createTreeSection(groupKey, level + 1);
                                
                                groupItems.forEach(item => {
                                    const itemLi = createTreeItem(item, level + 1);
                                    subUl.appendChild(itemLi);
                                });
                                
                                ul.appendChild(subLi);
                            }
                        });
                        
                        parentUl.appendChild(li);
                    }
                } else {
                    const { li, ul } = createTreeSection(categoryKey, level);
                    buildTreeStructureRecursive(categoryData, ul, level + 1);
                    parentUl.appendChild(li);
                }
            });
        }
        
        function groupMenuData(data) {
            if (!Array.isArray(data)) return { direct: [data] };
            
            const hasCategories = data.some(item => item.category);
            
            if (hasCategories) {
                const grouped = {};
                data.forEach(item => {
                    const category = item.category || 'Other';
                    if (!grouped[category]) grouped[category] = [];
                    grouped[category].push(item);
                });
                return grouped;
            } else {
                return { direct: data };
            }
        }
        
        let checkboxCounter = 0;
        function generateCheckboxId() {
            return 'checkbox-' + (++checkboxCounter);
        }
        
        function createTreeSection(title, level) {
            const checkboxId = generateCheckboxId();
            const levelClass = level > 0 ? ' level-' + level : '';
            
            const li = document.createElement('li');
            li.className = 'tree-section' + levelClass;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = checkboxId;
            
            const label = document.createElement('label');
            label.setAttribute('for', checkboxId);
            label.textContent = title;
            
            const ul = document.createElement('ul');
            
            li.appendChild(checkbox);
            li.appendChild(label);
            li.appendChild(ul);
            
            return { li, ul };
        }
        
        function createTreeItem(item, level) {
            const li = document.createElement('li');
            
            const button = document.createElement('button');
            button.className = 'tree-item';
            button.title = item.description;
            
            const text = item.label ? item.label + ' - ' + item.description : item.description;
            button.textContent = text;
            
            button.addEventListener('click', () => {
                vscode.postMessage({
                    type: 'insertText',
                    text: item.tag
                });
            });
            
            li.appendChild(button);
            return li;
        }
        
        // Build tree on load
        setTimeout(buildTreeStructure, 100);
        
        // Initialize everything
        initializeSettings();
        setupSettingsEvents();
    </script>
</body>
</html>`;
    }
}