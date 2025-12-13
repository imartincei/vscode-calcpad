<template>
  <div class="variables-tab">
    <div class="search-container">
      <input
        v-model="searchTerm"
        type="text"
        placeholder="Search variables, macros, functions..."
        class="search-input"
      />
    </div>
    <div class="variables-container p-3">
      <div v-if="loading" class="loading">
        Loading variables...
      </div>
      <div v-else-if="!hasVariables" class="no-variables">
        No variables found. Open a CalcPad document to see variables, macros, and functions.
      </div>
      <div v-else-if="searchTerm && !hasFilteredResults" class="no-variables">
        No results found for "{{ searchTerm }}"
      </div>
      <div v-else class="variables-sections">
        <!-- Macros Section -->
        <div v-if="filteredMacros.length > 0" class="variables-section">
          <div
            class="variables-header"
            :class="{ collapsed: collapsedSections.macros }"
            @click="toggleSection('macros')"
          >
            <span>Macros ({{ filteredMacros.length }})</span>
            <span class="expand-icon">▼</span>
          </div>
          <div
            class="variables-content"
            :class="{ collapsed: collapsedSections.macros }"
          >
            <div
              v-for="macro in filteredMacros"
              :key="`macro-${macro.name}`"
              class="variable-item"
              :title="getMacroTooltip(macro)"
              @click="insertMacro(macro)"
            >
              <div class="variable-name">{{ macro.name }}</div>
              <div class="variable-type">Macro</div>
              <div v-if="macro.definition" class="variable-content">{{ macro.definition }}</div>
              <div class="variable-source source-local">{{ getSourceLabel(macro.source) }}</div>
            </div>
          </div>
        </div>

        <!-- Variables Section -->
        <div v-if="filteredVariables.length > 0" class="variables-section">
          <div
            class="variables-header"
            :class="{ collapsed: collapsedSections.variables }"
            @click="toggleSection('variables')"
          >
            <span>Variables ({{ filteredVariables.length }})</span>
            <span class="expand-icon">▼</span>
          </div>
          <div
            class="variables-content"
            :class="{ collapsed: collapsedSections.variables }"
          >
            <div
              v-for="variable in filteredVariables"
              :key="`var-${variable.name}`"
              class="variable-item"
              :title="`Click to insert: ${variable.name}`"
              @click="insertVariable(variable.name)"
            >
              <div class="variable-name">{{ variable.name }}</div>
              <div class="variable-type">Variable</div>
              <div v-if="variable.definition" class="variable-content">{{ variable.definition }}</div>
              <div class="variable-source source-local">{{ getSourceLabel(variable.source) }}</div>
            </div>
          </div>
        </div>

        <!-- Functions Section -->
        <div v-if="filteredFunctions.length > 0" class="variables-section">
          <div
            class="variables-header"
            :class="{ collapsed: collapsedSections.functions }"
            @click="toggleSection('functions')"
          >
            <span>Functions ({{ filteredFunctions.length }})</span>
            <span class="expand-icon">▼</span>
          </div>
          <div
            class="variables-content"
            :class="{ collapsed: collapsedSections.functions }"
          >
            <div
              v-for="func in filteredFunctions"
              :key="`func-${func.name}`"
              class="variable-item"
              :title="getFunctionTooltip(func)"
              @click="insertFunction(func)"
            >
              <div class="variable-name">{{ func.name }}</div>
              <div class="variable-type">Function</div>
              <div v-if="func.params" class="variable-content">Parameters: {{ func.params }}</div>
              <div v-if="func.definition" class="variable-content">{{ func.definition }}</div>
              <div class="variable-source source-local">{{ getSourceLabel(func.source) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { VariablesData, VariableItem } from '../types'

// Props
interface Props {
  variablesData?: VariablesData
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variablesData: () => ({
    macros: [],
    variables: [],
    functions: []
  }),
  loading: false
})

// Emits
const emit = defineEmits<{
  insertText: [text: string]
}>()

// State
const searchTerm = ref('')
const collapsedSections = ref({
  macros: false,
  variables: false,
  functions: false
})

// Computed
const hasVariables = computed(() => {
  return props.variablesData.macros.length > 0 ||
         props.variablesData.variables.length > 0 ||
         props.variablesData.functions.length > 0
})

const filteredMacros = computed(() => {
  if (!searchTerm.value.trim()) {
    return props.variablesData.macros
  }
  const term = searchTerm.value.toLowerCase()
  return props.variablesData.macros.filter(macro =>
    macro.name.toLowerCase().includes(term)
  )
})

const filteredVariables = computed(() => {
  if (!searchTerm.value.trim()) {
    return props.variablesData.variables
  }
  const term = searchTerm.value.toLowerCase()
  return props.variablesData.variables.filter(variable =>
    variable.name.toLowerCase().includes(term)
  )
})

const filteredFunctions = computed(() => {
  if (!searchTerm.value.trim()) {
    return props.variablesData.functions
  }
  const term = searchTerm.value.toLowerCase()
  return props.variablesData.functions.filter(func =>
    func.name.toLowerCase().includes(term)
  )
})

const hasFilteredResults = computed(() => {
  return filteredMacros.value.length > 0 ||
         filteredVariables.value.length > 0 ||
         filteredFunctions.value.length > 0
})

// Methods
const toggleSection = (section: 'macros' | 'variables' | 'functions') => {
  collapsedSections.value[section] = !collapsedSections.value[section]
}

const insertVariable = (name: string) => {
  emit('insertText', name)
}

const insertMacro = (macro: VariableItem) => {
  // Insert macro with definition if available
  const macroText = macro.definition ? macro.definition : macro.name
  emit('insertText', macroText)
}

const insertFunction = (func: VariableItem) => {
  // Insert function with parameters if available
  const functionCall = func.params ? `${func.name}(${func.params})` : `${func.name}()`
  emit('insertText', functionCall)
}

const getSourceLabel = (source: string | undefined): string => {
  if (!source) return 'Current file'

  switch (source) {
    case 'local':
      return 'Current file'
    case 'include':
      return 'Included file'
    default:
      return source
  }
}

const getFunctionTooltip = (func: VariableItem): string => {
  const functionCall = func.params ? `${func.name}(${func.params})` : `${func.name}()`
  return `Click to insert: ${functionCall}`
}

// Watch for changes in variables data to auto-expand sections when new data arrives
watch(
  () => props.variablesData,
  (newData) => {
    if (newData.macros.length > 0 || newData.variables.length > 0 || newData.functions.length > 0) {
      // Auto-expand all sections when new data arrives (but only if they were previously empty)
      if (newData.macros.length > 0 && collapsedSections.value.macros === undefined) {
        collapsedSections.value.macros = false
      }
      if (newData.variables.length > 0 && collapsedSections.value.variables === undefined) {
        collapsedSections.value.variables = false
      }
      if (newData.functions.length > 0 && collapsedSections.value.functions === undefined) {
        collapsedSections.value.functions = false
      }
    }
  },
  { deep: true, immediate: true }
)
</script>

<style scoped>
.variables-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-container {
  padding: 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.search-input {
  width: 100%;
  padding: 8px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-input-foreground);
  border-radius: 3px;
  font-size: 12px;
  font-family: var(--vscode-font-family);
}

.search-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.variables-container {
  overflow-y: auto;
  flex: 1;
}

.loading,
.no-variables {
  text-align: center;
  color: var(--vscode-descriptionForeground);
  padding: 20px;
  font-style: italic;
}

.variables-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.variables-section {
  margin-bottom: 20px;
}

.variables-header {
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.variables-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.variables-header.collapsed .expand-icon {
  transform: rotate(-90deg);
}

.expand-icon {
  transition: transform 0.2s;
  font-size: 12px;
}

.variables-content {
  border-left: 2px solid var(--vscode-panel-border);
  margin-left: 10px;
  padding-left: 15px;
  max-height: 300px;
  overflow-y: auto;
  transition: max-height 0.3s ease;
}

.variables-content.collapsed {
  display: none;
}

.variable-item {
  padding: 8px 12px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.variable-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.variable-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--vscode-symbolIcon-variableForeground);
  margin-bottom: 4px;
}

.variable-type {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
  font-style: italic;
}

.variable-content {
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  background: var(--vscode-textCodeBlock-background);
  padding: 4px 6px;
  border-radius: 2px;
  white-space: pre-wrap;
  overflow-x: auto;
  max-height: 60px;
  overflow-y: auto;
  margin-bottom: 4px;
}

.variable-source {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  margin-top: 4px;
}

.source-local {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.source-include {
  color: var(--vscode-gitDecoration-modifiedResourceForeground);
}
</style>