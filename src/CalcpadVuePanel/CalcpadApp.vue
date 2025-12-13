<template>
  <div class="calcpad-vue-ui">
    <div class="tab-container">
      <!-- TODO: Remove v-show condition after PDF and Files features are fully developed -->
      <button
        v-for="tab in tabs"
        :key="tab.id"
        v-show="tab.id !== 'pdf' && tab.id !== 'files'"
        :class="['tab', { active: activeTab === tab.id }]"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="tab-content">
      <CalcpadInsertTab
        v-if="activeTab === 'insert'"
        :insert-data="insertData"
        @insert-text="handleInsertText"
      />
      <CalcpadSettingsTab
        v-else-if="activeTab === 'settings'"
        :settings="settings"
        :initial-preview-theme="previewTheme"
        :initial-enable-quick-typing="enableQuickTyping"
        @update-settings="handleUpdateSettings"
        @update-preview-theme="handleUpdatePreviewTheme"
        @update-quick-typing="handleUpdateQuickTyping"
        @reset-settings="handleResetSettings"
      />
      <CalcpadVariablesTab
        v-else-if="activeTab === 'variables'"
        :variables-data="variablesData"
        :loading="variablesLoading"
        @insert-text="handleInsertText"
      />
      <CalcpadFilesTab
        v-else-if="activeTab === 'files'"
      />
      <CalcpadPdfTab
        v-else-if="activeTab === 'pdf'"
        :pdf-settings="pdfSettings"
        @update-pdf-settings="handleUpdatePdfSettings"
        @reset-pdf-settings="handleResetPdfSettings"
        @generate-pdf="handleGeneratePdf"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import CalcpadInsertTab from './components/CalcpadInsertTab.vue'
import CalcpadSettingsTab from './components/CalcpadSettingsTab.vue'
import CalcpadVariablesTab from './components/CalcpadVariablesTab.vue'
import CalcpadFilesTab from './components/CalcpadFilesTab.vue'
import CalcpadPdfTab from './components/CalcpadPdfTab.vue'
import { postMessage } from './services/vscode'
import type { Tab, InsertData, Settings, VariablesData, PdfSettings } from './types'

// State
const activeTab = ref('insert')
const insertData = ref<InsertData>({})
const settings = ref<Settings>()
const previewTheme = ref('system')
const enableQuickTyping = ref(true)
const variablesData = ref<VariablesData>({
  macros: [],
  variables: [],
  functions: []
})
const variablesLoading = ref(false)
const pdfSettings = ref<PdfSettings>({
  enableHeader: true,
  documentTitle: '',
  documentSubtitle: '',
  headerCenter: '',
  author: '',
  enableFooter: true,
  footerCenter: '',
  company: '',
  project: '',
  showPageNumbers: true,
  format: 'A4',
  orientation: 'portrait',
  marginTop: '2cm',
  marginBottom: '2cm',
  marginLeft: '1.5cm',
  marginRight: '1.5cm',
  printBackground: true,
  scale: 1.0
})

const tabs: Tab[] = [
  { id: 'insert', label: 'Insert' },
  { id: 'settings', label: 'Settings' },
  { id: 'variables', label: 'Variables' },
  { id: 'files', label: 'Files' },
  { id: 'pdf', label: 'PDF' }
]

// Methods
const switchTab = (tabId: string) => {
  activeTab.value = tabId

  // Request fresh data when switching to variables tab
  if (tabId === 'variables') {
    variablesLoading.value = true
    postMessage({ type: 'getVariables' })
  }
}

const handleInsertText = (text: string) => {
  postMessage({
    type: 'insertText',
    text
  })
}

const handleUpdateSettings = (newSettings: Settings) => {
  postMessage({
    type: 'updateSettings',
    settings: newSettings
  })
}

const handleUpdatePreviewTheme = (theme: string) => {
  postMessage({
    type: 'updatePreviewTheme',
    theme
  })
}

const handleUpdateQuickTyping = (enabled: boolean) => {
  postMessage({
    type: 'updateQuickTyping',
    enabled
  })
}

const handleResetSettings = () => {
  postMessage({
    type: 'resetSettings'
  })
}

const handleUpdatePdfSettings = (settings: PdfSettings) => {
  postMessage({
    type: 'updatePdfSettings',
    settings
  })
}

const handleResetPdfSettings = () => {
  postMessage({
    type: 'resetPdfSettings'
  })
}

const handleGeneratePdf = () => {
  postMessage({
    type: 'generatePdf'
  })
}

// VS Code message handler
const handleMessage = (event: MessageEvent) => {
  const message = event.data

  switch (message.type) {
    case 'insertDataResponse':
      insertData.value = message.data
      break
    case 'settingsResponse':
      settings.value = message.settings
      previewTheme.value = message.previewTheme || 'system'
      break
    case 'settingsReset':
      settings.value = message.settings
      break
    case 'updateVariables':
      variablesData.value = message.data
      variablesLoading.value = false
      break
    case 'pdfSettingsResponse':
      pdfSettings.value = message.settings
      break
    case 'pdfSettingsReset':
      pdfSettings.value = message.settings
      break
    default:
      console.log('Unhandled message:', message)
  }
}

// Initialize
onMounted(() => {
  // Listen for messages from VS Code
  window.addEventListener('message', handleMessage)

  // Request initial data
  postMessage({ type: 'getInsertData' })
  postMessage({ type: 'getSettings' })
  postMessage({ type: 'getPdfSettings' })

  // Debug message
  postMessage({
    type: 'debug',
    message: 'CalcpadVueApp mounted successfully'
  })
})
</script>

<style scoped>
.calcpad-vue-ui {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

.tab-container {
  display: flex;
  border-bottom: 1px solid var(--vscode-widget-border);
  background: var(--vscode-editor-background);
}

.tab {
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--vscode-tab-inactiveForeground);
  cursor: pointer;
  font-size: 11px;
  font-weight: normal;
  border-radius: 0;
  transition: all 0.2s ease;
}

.tab:hover {
  background: var(--vscode-tab-hoverBackground);
  color: var(--vscode-tab-activeForeground);
}

.tab.active {
  background: var(--vscode-tab-activeBackground);
  color: var(--vscode-tab-activeForeground);
  border-bottom: 2px solid var(--vscode-tab-activeBorder);
}

.tab-content {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.tab-placeholder {
  padding: 20px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}
</style>