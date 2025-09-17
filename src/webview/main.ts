// Main UI functionality for CalcPad webview

interface InsertItem {
    label?;
    tag;
    description?;
    categoryPath?;
    category?;
}

declare const acquireVsCodeApi: () => {
    postMessage(message: unknown);
};

declare const Vue: {
    createApp(config: unknown): {
        mount(selector): unknown;
    };
    defineComponent(config: unknown): unknown;
};

interface InsertCategory {
    direct?: InsertItem[];
    [key]: InsertItem[] | InsertCategory | undefined;
}

interface InsertData {
    [key]: InsertCategory;
}

declare let insertData: InsertData;

const vscode = acquireVsCodeApi();

interface Settings {
    math: {
        decimals: number;
        degrees: number;
        isComplex: boolean;
        substitute: boolean;
        formatEquations: boolean;
    };
    plot: {
        isAdaptive: boolean;
        screenScaleFactor: number;
        imagePath;
        imageUri;
        vectorGraphics: boolean;
        colorScale;
        smoothScale: boolean;
        shadows: boolean;
        lightDirection;
    };
    server: {
        url;
    };
    units;
    output: {
        format;
        silent: boolean;
    };
}

interface VariableItem {
    name;
    definition?;
    content?;
    source?;
    params?;
}

interface VariablesData {
    macros: VariableItem[];
    variables: VariableItem[];
    functions: VariableItem[];
}

interface S3Manager {
    setApiUrl(url);
    initialize();
}


interface VueComponentContext {
    insertData: InsertData;
    allItems: InsertItem[];
    searchTerm;
    filteredItems: InsertItem[];
    displayItems: InsertItem[];
    s3State: {
        isAuthenticated: boolean;
        authToken | null;
        currentUser: unknown;
        apiUrl;
        files: unknown[];
        loading: boolean;
        error | null;
        searchQuery;
    };
    $nextTick: (callback: () => void) => void;
    initializeItems();
    flattenItems(data: InsertData, currentPath[], result: InsertItem[]);
    setupSearch();
    filterItems();
    insertItem(item: InsertItem);
    buildTreeStructure();
    buildTreeStructureRecursive(data: InsertData, parentUl: HTMLUListElement, level: number);
    groupMenuData(data: InsertItem[]): { [key]: InsertItem[] };
    createTreeSection(title, level: number): { li; ul: HTMLUListElement };
    createTreeItem(item: InsertItem, level: number);
    collapseAll();
}

interface VueAppConfig {
    data(): {
        insertData: InsertData;
        allItems: InsertItem[];
        searchTerm;
        filteredItems: InsertItem[];
    };
    computed: {
        displayItems(): InsertItem[];
    };
    mounted();
    methods: {
        initializeItems();
        flattenItems(data: InsertData, currentPath[], result: InsertItem[]);
        setupSearch();
        filterItems();
        insertItem(item: InsertItem);
        buildTreeStructure();
        buildTreeStructureRecursive(data: InsertData, parentUl: HTMLUListElement, level: number);
        groupMenuData(data: InsertItem[]): { [key]: InsertItem[] };
        createTreeSection(title, level: number): { li; ul: HTMLUListElement };
        createTreeItem(item: InsertItem, level: number);
        collapseAll();
    };
}

interface ExtendedWindow extends Window {
    S3Manager?: new () => S3Manager;
    s3Manager?: S3Manager;
    unifiedVueApp?: {
        s3State: {
            apiUrl;
            isAuthenticated: boolean;
            authToken | null;
            currentUser: unknown;
            files: unknown[];
            loading: boolean;
            error | null;
            searchQuery;
        };
    };
    switchTab: (tabId) => void;
    toggleSection: (header: HTMLElement) => void;
    insertTextAtCursor: (text) => void;
}

// Tab switching functionality
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
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Add active class to clicked tab
    const activeTab = document.querySelector("button[onclick*=\"'" + tabId + "'\"]") as HTMLElement;
    if (activeTab) {
        activeTab.classList.add('active');
    }
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

function getSettings(): Settings {
    const getElement = (id) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;

    return {
        math: {
            decimals: parseInt(getElement('decimals').value),
            degrees: parseInt(getElement('degrees').value),
            isComplex: (getElement('isComplex') as HTMLInputElement).checked,
            substitute: (getElement('substitute') as HTMLInputElement).checked,
            formatEquations: (getElement('formatEquations') as HTMLInputElement).checked
        },
        plot: {
            isAdaptive: (getElement('isAdaptive') as HTMLInputElement).checked,
            screenScaleFactor: parseFloat(getElement('screenScaleFactor').value),
            imagePath: "",
            imageUri: "",
            vectorGraphics: (getElement('vectorGraphics') as HTMLInputElement).checked,
            colorScale: getElement('colorScale').value,
            smoothScale: (getElement('smoothScale') as HTMLInputElement).checked,
            shadows: (getElement('shadows') as HTMLInputElement).checked,
            lightDirection: getElement('lightDirection').value
        },
        server: {
            url: getElement('serverUrl').value
        },
        units: getElement('units').value,
        output: {
            format: getElement('outputFormat').value,
            silent: (getElement('silent') as HTMLInputElement).checked
        }
    };
}

function loadSettings(settings: Settings) {
    const getElement = (id) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;

    getElement('decimals').value = settings.math.decimals.toString();
    getElement('degrees').value = settings.math.degrees.toString();
    (getElement('isComplex') as HTMLInputElement).checked = settings.math.isComplex;
    (getElement('substitute') as HTMLInputElement).checked = settings.math.substitute;
    (getElement('formatEquations') as HTMLInputElement).checked = settings.math.formatEquations;

    (getElement('isAdaptive') as HTMLInputElement).checked = settings.plot.isAdaptive;
    getElement('screenScaleFactor').value = settings.plot.screenScaleFactor.toString();
    (getElement('vectorGraphics') as HTMLInputElement).checked = settings.plot.vectorGraphics;
    getElement('colorScale').value = settings.plot.colorScale;
    (getElement('smoothScale') as HTMLInputElement).checked = settings.plot.smoothScale;
    (getElement('shadows') as HTMLInputElement).checked = settings.plot.shadows;
    getElement('lightDirection').value = settings.plot.lightDirection;

    getElement('serverUrl').value = settings.server.url;
    getElement('units').value = settings.units;
    getElement('outputFormat').value = settings.output.format;
    (getElement('silent') as HTMLInputElement).checked = settings.output.silent;
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
    const inputs = document.querySelectorAll('#settings-tab input, #settings-tab select:not(#previewTheme)');
    inputs.forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Handle preview theme separately as it's a VS Code setting, not CalcPad settings
    const previewThemeElement = document.getElementById('previewTheme');
    if (previewThemeElement) {
        previewThemeElement.addEventListener('change', function(e) {
            const target = e.target as HTMLSelectElement;
            vscode.postMessage({
                type: 'updatePreviewTheme',
                theme: target.value
            });
        });
    }

    // Reset button
    const resetButton = document.getElementById('reset-settings');
    if (resetButton) {
        resetButton.addEventListener('click', resetSettings);
    }

    // S3 Config button
    const s3ConfigButton = document.getElementById('open-s3-config');
    if (s3ConfigButton) {
        s3ConfigButton.addEventListener('click', function() {
            vscode.postMessage({
                type: 'openS3Config'
            });
        });
    }
}

function initializeSettings() {
    // Request current settings from extension
    vscode.postMessage({ type: 'getSettings' });
}

// Variables tab functionality
function updateVariablesTab(data: VariablesData) {
    const container = document.getElementById('variables-container');
    const searchInput = document.getElementById('variables-search-input');

    if (!container) return;

    if (!data || (!data.macros?.length && !data.variables?.length && !data.functions?.length)) {
        container.innerHTML = '<div class="no-variables">No variables, macros, or functions found.</div>';
        return;
    }

    let html = '';

    // Macros section
    if (data.macros.length > 0) {
        html += '<div class="variables-section">';
        html += '<div class="variables-header" onclick="toggleSection(this)">';
        html += '<span>Macros (' + data.macros.length + ')</span>';
        html += '<span class="expand-icon">▼</span>';
        html += '</div>';
        html += '<div class="variables-content">';
        data.macros.forEach(macro => {
            html += '<div class="variable-item" onclick="insertTextAtCursor(\'' + macro.name + '\')">';
            html += '<div class="variable-name">' + macro.name + '</div>';
            html += '<div class="variable-type">Macro</div>';
            html += '<div class="variable-content">' + (macro.content || 'No content') + '</div>';
            html += '<div class="variable-source source-' + macro.source + '">Source: ' + macro.source + '</div>';
            html += '</div>';
        });
        html += '</div></div>';
    }

    // Functions section
    if (data.functions.length > 0) {
        html += '<div class="variables-section">';
        html += '<div class="variables-header" onclick="toggleSection(this)">';
        html += '<span>Functions (' + data.functions.length + ')</span>';
        html += '<span class="expand-icon">▼</span>';
        html += '</div>';
        html += '<div class="variables-content">';
        data.functions.forEach(func => {
            const signature = func.name + '(' + (func.params || '') + ')';
            html += '<div class="variable-item" onclick="insertTextAtCursor(\'' + signature + '\')">';
            html += '<div class="variable-name">' + signature + '</div>';
            html += '<div class="variable-type">Function</div>';
            html += '<div class="variable-content">' + (func.content || 'No content') + '</div>';
            html += '<div class="variable-source source-' + func.source + '">Source: ' + func.source + '</div>';
            html += '</div>';
        });
        html += '</div></div>';
    }

    // Variables section
    if (data.variables.length > 0) {
        html += '<div class="variables-section">';
        html += '<div class="variables-header" onclick="toggleSection(this)">';
        html += '<span>Variables (' + data.variables.length + ')</span>';
        html += '<span class="expand-icon">▼</span>';
        html += '</div>';
        html += '<div class="variables-content">';
        data.variables.forEach(variable => {
            html += '<div class="variable-item" onclick="insertTextAtCursor(\'' + variable.name + '\')">';
            html += '<div class="variable-name">' + variable.name + '</div>';
            html += '<div class="variable-type">Variable</div>';
            html += '<div class="variable-content">' + (variable.definition || 'No definition') + '</div>';
            html += '<div class="variable-source source-' + variable.source + '">Source: ' + variable.source + '</div>';
            html += '</div>';
        });
        html += '</div></div>';
    }

    container.innerHTML = html;

    // Add search functionality
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = (this as HTMLInputElement).value.toLowerCase();
            const items = container.querySelectorAll('.variable-item');

            items.forEach(item => {
                const nameEl = item.querySelector('.variable-name');
                const contentEl = item.querySelector('.variable-content');

                if (nameEl && contentEl) {
                    const name = nameEl.textContent?.toLowerCase() || '';
                    const content = contentEl.textContent?.toLowerCase() || '';

                    if (name.includes(query) || content.includes(query)) {
                        (item as HTMLElement).style.display = 'block';
                    } else {
                        (item as HTMLElement).style.display = 'none';
                    }
                }
            });

            // Hide sections with no visible items
            const sections = container.querySelectorAll('.variables-section');
            sections.forEach(section => {
                const visibleItems = section.querySelectorAll('.variable-item[style="display: block"], .variable-item:not([style*="display: none"])');
                if (query && visibleItems.length === 0) {
                    (section as HTMLElement).style.display = 'none';
                } else {
                    (section as HTMLElement).style.display = 'block';
                }
            });
        });
    }

}

function toggleSection(header: HTMLElement) {
    const content = header.nextElementSibling as HTMLElement;
    const icon = header.querySelector('.expand-icon') as HTMLElement;

    if (content && icon) {
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');

        if (header.classList.contains('collapsed')) {
            icon.textContent = '▶';
        } else {
            icon.textContent = '▼';
        }
    }
}

function insertTextAtCursor(text) {
    vscode.postMessage({
        type: 'insertText',
        text: text
    });
}

// PDF Settings
function setupPdfSettings() {
    const pdfInputs = document.querySelectorAll('#pdf-tab input, #pdf-tab select');

    pdfInputs.forEach(input => {
        input.addEventListener('change', function() {
            const getElement = (id) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;

            const pdfSettings = {
                enableHeader: (getElement('enableHeader') as HTMLInputElement).checked,
                documentTitle: getElement('documentTitle').value,
                documentSubtitle: getElement('documentSubtitle').value,
                headerCenter: getElement('headerCenter').value,
                author: getElement('author').value,
                enableFooter: (getElement('enableFooter') as HTMLInputElement).checked,
                footerCenter: getElement('footerCenter').value,
                company: getElement('company').value,
                project: getElement('project').value,
                showPageNumbers: (getElement('showPageNumbers') as HTMLInputElement).checked,
                format: getElement('pdfFormat').value,
                orientation: getElement('pdfOrientation').value,
                marginTop: getElement('marginTop').value,
                marginBottom: getElement('marginBottom').value,
                marginLeft: getElement('marginLeft').value,
                marginRight: getElement('marginRight').value,
                printBackground: (getElement('printBackground') as HTMLInputElement).checked,
                scale: parseFloat(getElement('pdfScale').value)
            };

            vscode.postMessage({
                type: 'updatePdfSettings',
                settings: pdfSettings
            });
        });
    });

    // Reset PDF settings button
    const resetPdfButton = document.getElementById('reset-pdf-settings');
    if (resetPdfButton) {
        resetPdfButton.addEventListener('click', function() {
            vscode.postMessage({
                type: 'resetPdfSettings'
            });
        });
    }
}

// Initialize unified Vue app for entire webview
function initializeUnifiedVueApp() {
    const { createApp, defineComponent } = Vue;

    const componentConfig = defineComponent({
        data() {
            return {
                insertData: insertData,
                allItems: [] as InsertItem[],
                searchTerm: '',
                filteredItems: [] as InsertItem[],
                // S3 state
                s3State: {
                    isAuthenticated: false,
                    authToken: null,
                    currentUser: null,
                    apiUrl: '',
                    files: [],
                    loading: false,
                    error: null,
                    searchQuery: ''
                }
            };
        },
        computed: {
            displayItems(): InsertItem[] {
                if (this.searchTerm.trim()) {
                    return this.filteredItems;
                }
                return this.allItems;
            },
            s3FilteredFiles(): unknown[] {
                if (!this.s3State.searchQuery.trim()) {
                    return this.s3State.files;
                }
                const query = this.s3State.searchQuery.toLowerCase();
                return this.s3State.files.filter((file: { fileName }) =>
                    file.fileName.toLowerCase().includes(query)
                );
            }
        },
        mounted() {
            this.initializeItems();
            this.setupSearch();
            // Build tree structure after Vue has rendered
            this.$nextTick(() => {
                this.buildTreeStructure();
            });
        },
        methods: {
            initializeItems() {
                this.allItems = [];
                this.flattenItems(this.insertData, [], this.allItems);
            },
            flattenItems(data: InsertData, currentPath[], result: InsertItem[]) {
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
                    } else if (typeof categoryData === 'object' && categoryData !== null) {
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
                                const subValue = categoryData[subKey];
                                if (subValue) {
                                    const subData = { [subKey]: subValue } as InsertData;
                                    this.flattenItems(subData, newPath, result);
                                }
                            }
                        });
                    }
                });
            },
            setupSearch() {
                const searchInput = document.getElementById('insert-search-input');
                if (searchInput) {
                    searchInput.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        this.searchTerm = target.value;
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

                const itemMatches = this.allItems.filter((item: InsertItem) =>
                    item.label?.toLowerCase().includes(term) ||
                    item.tag?.toLowerCase().includes(term) ||
                    item.description?.toLowerCase().includes(term)
                );

                const categoryMatches = this.allItems.filter((item: InsertItem) =>
                    item.categoryPath?.toLowerCase().includes(term) &&
                    !itemMatches.includes(item)
                );

                this.filteredItems = [...itemMatches, ...categoryMatches];
            },
            insertItem(item: InsertItem) {
                vscode.postMessage({
                    type: 'insertText',
                    text: item.tag
                });
            },
            buildTreeStructure() {
                const treeContainer = document.getElementById('tree-container');
                if (!treeContainer) return;

                // Clear existing content
                treeContainer.innerHTML = '';

                const treeRoot = document.createElement('ul');
                treeRoot.className = 'tree';
                treeContainer.appendChild(treeRoot);

                this.buildTreeStructureRecursive(this.insertData, treeRoot, 0);
            },
            buildTreeStructureRecursive(data: InsertData, parentUl: HTMLUListElement, level: number) {
                if (level >= 5) return; // Allow up to level 4

                Object.keys(data).forEach(categoryKey => {
                    const categoryData = data[categoryKey];

                    if (Array.isArray(categoryData)) {
                        const groupedData = this.groupMenuData(categoryData);

                        if (Object.keys(groupedData).length === 1 && groupedData.direct) {
                            const { li, ul } = this.createTreeSection(categoryKey, level);

                            categoryData.forEach(item => {
                                const itemLi = this.createTreeItem(item, level);
                                ul.appendChild(itemLi);
                            });

                            parentUl.appendChild(li);
                        } else {
                            const { li, ul } = this.createTreeSection(categoryKey, level);

                            Object.keys(groupedData).forEach(groupKey => {
                                if (groupKey !== 'direct') {
                                    const groupItems = groupedData[groupKey];
                                    const { li: subLi, ul: subUl } = this.createTreeSection(groupKey, level + 1);

                                    groupItems.forEach(item => {
                                        const itemLi = this.createTreeItem(item, level + 1);
                                        subUl.appendChild(itemLi);
                                    });

                                    ul.appendChild(subLi);
                                }
                            });

                            parentUl.appendChild(li);
                        }
                    } else {
                        const { li, ul } = this.createTreeSection(categoryKey, level);
                        this.buildTreeStructureRecursive(categoryData as InsertData, ul, level + 1);
                        parentUl.appendChild(li);
                    }
                });
            },
            groupMenuData(data: InsertItem[]): { [key]: InsertItem[] } {
                if (!Array.isArray(data)) return { direct: [data] };

                const hasCategories = data.some(item => item.category);

                if (hasCategories) {
                    const grouped: { [key]: InsertItem[] } = {};
                    data.forEach(item => {
                        const category = item.category || 'Other';
                        if (!grouped[category]) grouped[category] = [];
                        grouped[category].push(item);
                    });
                    return grouped;
                } else {
                    return { direct: data };
                }
            },
            createTreeSection(title, level: number): { li; ul: HTMLUListElement } {
                const checkboxId = 'checkbox-' + Date.now() + '-' + Math.random();
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
            },
            createTreeItem(item: InsertItem, level: number) {
                const li = document.createElement('li');

                const button = document.createElement('button');
                button.className = 'tree-item';
                button.title = item.description || '';

                const text = item.label ? item.label + ' - ' + (item.description || '') : (item.description || '');
                button.textContent = text;

                button.addEventListener('click', () => {
                    this.insertItem(item);
                });

                li.appendChild(button);
                return li;
            },
            collapseAll() {
                const checkboxes = document.querySelectorAll('#tree-container input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    (checkbox as HTMLInputElement).checked = false;
                });
            },

            // S3 Methods
            async s3Login() {
                const usernameInput = document.getElementById('s3-username') as HTMLInputElement;
                const passwordInput = document.getElementById('s3-password') as HTMLInputElement;

                if (!usernameInput || !passwordInput) {
                    this.s3State.error = 'Username or password field not found';
                    return;
                }

                const username = usernameInput.value;
                const password = passwordInput.value;

                if (!username || !password) {
                    this.s3State.error = 'Please enter both username and password';
                    return;
                }

                this.s3State.loading = true;
                this.s3State.error = null;

                try {
                    vscode.postMessage({ type: 'debug', message: '[S3Login] Starting login for user: ' + username });

                    if (!this.s3State.apiUrl) {
                        throw new Error('S3 API URL not configured');
                    }

                    const response = await fetch(this.s3State.apiUrl + '/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });

                    if (!response.ok) {
                        throw new Error('Login failed with status: ' + response.status);
                    }

                    const data = await response.json();

                    this.s3State.authToken = data.token;
                    this.s3State.currentUser = data.user;
                    this.s3State.isAuthenticated = true;

                    vscode.postMessage({ type: 'debug', message: '[S3Login] Login successful for user: ' + data.user.username });

                    vscode.postMessage({
                        type: 'storeS3JWT',
                        jwt: data.token
                    });

                    await this.s3RefreshFiles();

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.s3State.error = errorMessage;
                    vscode.postMessage({ type: 'debug', message: '[S3Login] Login failed: ' + errorMessage });
                } finally {
                    this.s3State.loading = false;
                }
            },

            s3Logout() {
                this.s3State.isAuthenticated = false;
                this.s3State.authToken = null;
                this.s3State.currentUser = null;
                this.s3State.files = [];
                this.s3State.error = null;
                this.s3State.searchQuery = '';

                vscode.postMessage({
                    type: 'clearS3JWT'
                });

                vscode.postMessage({ type: 'debug', message: '[S3Logout] User logged out' });
            },

            async s3RefreshFiles() {
                if (!this.s3State.authToken) {
                    vscode.postMessage({ type: 'debug', message: '[S3Files] No auth token, skipping file refresh' });
                    return;
                }

                this.s3State.loading = true;
                this.s3State.error = null;

                try {
                    vscode.postMessage({ type: 'debug', message: '[S3Files] Refreshing files from: ' + this.s3State.apiUrl });

                    const response = await fetch(this.s3State.apiUrl + '/api/files', {
                        headers: { 'Authorization': 'Bearer ' + this.s3State.authToken }
                    });

                    if (!response.ok) {
                        throw new Error('Failed to fetch files: ' + response.status);
                    }

                    const data = await response.json();
                    this.s3State.files = data;
                    vscode.postMessage({ type: 'debug', message: '[S3Files] Loaded ' + data.length + ' files' });

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    this.s3State.error = errorMessage;
                    vscode.postMessage({ type: 'debug', message: '[S3Files] Error loading files: ' + errorMessage });
                } finally {
                    this.s3State.loading = false;
                }
            },

            s3FormatFileSize(bytes: number) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            },

            s3SelectFile(file: { fileName }) {
                vscode.postMessage({ type: 'debug', message: '[S3Files] Selected file: ' + file.fileName });
            }
        }
    });

    const app = createApp(componentConfig);
    const mountedApp = app.mount('.calcpad-ui');
    (window as unknown as ExtendedWindow).unifiedVueApp = mountedApp as unknown as ExtendedWindow['unifiedVueApp'];
}

// Message handling
function handleMessage(event: MessageEvent) {
    const message = event.data as {
        type;
        settings?: Settings;
        previewTheme?;
        data?: VariablesData;
        apiUrl?;
        [key]: unknown;
    };

    switch (message.type) {
        case 'settingsResponse':
            if (message.settings) {
                loadSettings(message.settings);
                if (message.previewTheme) {
                    const previewThemeElement = document.getElementById('previewTheme') as HTMLSelectElement;
                    if (previewThemeElement) {
                        previewThemeElement.value = message.previewTheme;
                    }
                }
            }
            break;
        case 'settingsReset':
            if (message.settings) {
                loadSettings(message.settings);
                // Reset preview theme to default
                const previewThemeElement = document.getElementById('previewTheme') as HTMLSelectElement;
                if (previewThemeElement) {
                    previewThemeElement.value = 'system';
                }
            }
            break;
        case 'updateVariables':
            if (message.data) {
                vscode.postMessage({ type: 'debug', message: '[Variables] Received updateVariables message with ' + (message.data.macros?.length || 0) + ' macros, ' + (message.data.variables?.length || 0) + ' variables, ' + (message.data.functions?.length || 0) + ' functions' });
                updateVariablesTab(message.data);
            }
            break;
        case 's3ConfigResponse':
            // Handle S3 config response for unified Vue app
            if (message.apiUrl && (window as unknown as ExtendedWindow).unifiedVueApp) {
                (window as unknown as ExtendedWindow).unifiedVueApp!.s3State.apiUrl = message.apiUrl;
                vscode.postMessage({ type: 'debug', message: '[S3Config] API URL set to: ' + message.apiUrl });
            }
            break;
    }
}

// Initialize everything when DOM is loaded
function initialize() {
    // Make functions available globally
    const globalWindow = window as unknown as ExtendedWindow;
    globalWindow.switchTab = switchTab;
    globalWindow.toggleSection = toggleSection;
    globalWindow.insertTextAtCursor = insertTextAtCursor;

    // Set up tab switching event listeners
    setupTabSwitching();

    // Set up event listeners
    window.addEventListener('message', handleMessage);

    // Initialize settings
    initializeSettings();
    setupSettingsEvents();
    setupPdfSettings();

    // Initialize unified Vue app
    initializeUnifiedVueApp();

    // Request S3 config for the unified app
    vscode.postMessage({ type: 'getS3Config' });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Set up tab switching with event listeners
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab');

    tabButtons.forEach((button) => {
        const buttonElement = button as HTMLButtonElement;
        const onclick = buttonElement.getAttribute('onclick');

        if (onclick) {
            // Extract tab ID from onclick attribute
            const match = onclick.match(/switchTab\('([^']+)'\)/);
            if (match) {
                const tabId = match[1];
                buttonElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    switchTab(tabId);
                });
            }
        }
    });
}

// Functions are exposed globally in the initialize() function