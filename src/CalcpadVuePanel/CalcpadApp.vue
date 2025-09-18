<template>
  <div class="calcpad-vue-ui">
    <div class="tab-container">
      <button
        v-for="tab in tabs"
        :key="tab.id"
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
        @update-settings="handleUpdateSettings"
        @update-preview-theme="handleUpdatePreviewTheme"
        @reset-settings="handleResetSettings"
      />
      <CalcpadVariablesTab
        v-else-if="activeTab === 'variables'"
        :variables-data="variablesData"
        :loading="variablesLoading"
        @insert-text="handleInsertText"
      />
      <div v-else-if="activeTab === 'files'" class="tab-placeholder">
        Files tab - Coming soon!
      </div>
      <div v-else-if="activeTab === 'pdf'" class="tab-placeholder">
        PDF tab - Coming soon!
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import CalcpadInsertTab from './components/CalcpadInsertTab.vue'
import CalcpadSettingsTab from './components/CalcpadSettingsTab.vue'
import CalcpadVariablesTab from './components/CalcpadVariablesTab.vue'
import type { Tab, InsertData, Settings, VariablesData } from './types'

// State
const activeTab = ref('insert')
const insertData = ref<InsertData>({})
const settings = ref<Settings>()
const previewTheme = ref('system')
const variablesData = ref<VariablesData>({
  macros: [],
  variables: [],
  functions: []
})
const variablesLoading = ref(false)

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
}

const handleInsertText = (text: string) => {
  window.vscode.postMessage({
    type: 'insertText',
    text
  })
}

const handleUpdateSettings = (newSettings: Settings) => {
  window.vscode.postMessage({
    type: 'updateSettings',
    settings: newSettings
  })
}

const handleUpdatePreviewTheme = (theme: string) => {
  window.vscode.postMessage({
    type: 'updatePreviewTheme',
    theme
  })
}

const handleResetSettings = () => {
  window.vscode.postMessage({
    type: 'resetSettings'
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
    default:
      console.log('Unhandled message:', message)
  }
}

// Initialize
onMounted(() => {
  // Listen for messages from VS Code
  window.addEventListener('message', handleMessage)

  // Request initial data
  window.vscode.postMessage({ type: 'getInsertData' })
  window.vscode.postMessage({ type: 'getSettings' })

  // Debug message
  window.vscode.postMessage({
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