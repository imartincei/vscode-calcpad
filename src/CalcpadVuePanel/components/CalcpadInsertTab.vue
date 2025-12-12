<template>
  <div class="insert-tab">
    <div class="search-container">
      <input
        v-model="searchTerm"
        type="text"
        placeholder="Search items..."
        class="search-input"
      />
    </div>

    <div v-if="searchTerm && filteredItems.length === 0" class="no-items">
      No items found for "{{ searchTerm }}"
    </div>
    <div v-else-if="displayItems.length === 0" class="no-items">
      No insert items available
    </div>
    <div v-else-if="searchTerm" class="search-results">
      <div
        v-for="item in displayItems"
        :key="item.tag"
        @click="insertItem(item)"
        class="insert-item"
      >
        <div class="item-tag">{{ item.tag }}</div>
        <div v-if="item.label && item.label !== item.tag" class="item-label">
          {{ item.label }}
        </div>
        <div v-if="item.description" class="item-description">
          {{ item.description }}
        </div>
        <div v-if="item.quickType" class="item-quicktype">
          Quick type: {{ item.quickType }}
        </div>
        <div v-if="item.categoryPath" class="item-category">
          {{ item.categoryPath }}
        </div>
      </div>
    </div>
    <div v-else class="tree-view">
      <div class="tree-actions">
        <button @click="collapseAll" class="collapse-btn">
          Collapse All
        </button>
      </div>
      <div id="tree-container" class="tree-container">
        <!-- Tree structure will be built here -->
        <div class="tree-placeholder">
          Loading insert items...
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { InsertItem, InsertData, InsertCategory } from '../types'

// Props
interface Props {
  insertData: InsertData
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  insertText: [text: string]
}>()

// State
const searchTerm = ref('')
const allItems = ref<InsertItem[]>([])

// Computed
const filteredItems = computed(() => {
  if (!searchTerm.value.trim()) {
    return []
  }

  const term = searchTerm.value.toLowerCase()

  const itemMatches = allItems.value.filter((item: InsertItem) =>
    item.label?.toLowerCase().includes(term) ||
    item.tag?.toLowerCase().includes(term) ||
    item.description?.toLowerCase().includes(term)
  )

  const categoryMatches = allItems.value.filter((item: InsertItem) =>
    item.categoryPath?.toLowerCase().includes(term) &&
    !itemMatches.includes(item)
  )

  return [...itemMatches, ...categoryMatches]
})

const displayItems = computed(() => {
  if (searchTerm.value.trim()) {
    return filteredItems.value
  }
  return allItems.value
})

// Methods
const flattenItems = (data: InsertData, currentPath: string[] = [], result: InsertItem[] = []): InsertItem[] => {
  Object.keys(data).forEach(categoryKey => {
    const categoryData = data[categoryKey]
    const newPath = [...currentPath, categoryKey]

    if (Array.isArray(categoryData)) {
      categoryData.forEach(item => {
        result.push({
          ...item,
          categoryPath: newPath.join(' > ')
        })
      })
    } else if (typeof categoryData === 'object' && categoryData !== null) {
      if (categoryData.direct && Array.isArray(categoryData.direct)) {
        categoryData.direct.forEach(item => {
          result.push({
            ...item,
            categoryPath: newPath.join(' > ')
          })
        })
      }

      Object.keys(categoryData).forEach(subKey => {
        if (subKey !== 'direct') {
          const subValue = categoryData[subKey]
          if (subValue) {
            const subData = { [subKey]: subValue } as InsertData
            flattenItems(subData, newPath, result)
          }
        }
      })
    }
  })

  return result
}

const initializeItems = () => {
  allItems.value = flattenItems(props.insertData)
}

const insertItem = (item: InsertItem) => {
  emit('insertText', item.tag)
}

const collapseAll = () => {
  const checkboxes = document.querySelectorAll('#tree-container input[type="checkbox"]')
  checkboxes.forEach(checkbox => {
    (checkbox as HTMLInputElement).checked = false
  })
}

const buildTreeStructure = () => {
  const treeContainer = document.getElementById('tree-container')
  if (!treeContainer) return

  // Clear existing content
  treeContainer.innerHTML = ''

  if (Object.keys(props.insertData).length === 0) {
    treeContainer.innerHTML = '<div class="tree-placeholder">No insert data available</div>'
    return
  }

  const treeRoot = document.createElement('ul')
  treeRoot.className = 'tree'
  treeContainer.appendChild(treeRoot)

  buildTreeStructureRecursive(props.insertData, treeRoot, 0)
}

const buildTreeStructureRecursive = (data: InsertData, parentUl: HTMLUListElement, level: number) => {
  if (level >= 5) return // Prevent infinite recursion

  Object.keys(data).forEach(categoryKey => {
    const categoryData = data[categoryKey]

    if (Array.isArray(categoryData)) {
      const { li, ul } = createTreeSection(categoryKey, level)

      categoryData.forEach(item => {
        const itemLi = createTreeItem(item)
        ul.appendChild(itemLi)
      })

      parentUl.appendChild(li)
    } else if (typeof categoryData === 'object' && categoryData !== null) {
      const { li, ul } = createTreeSection(categoryKey, level)
      buildTreeStructureRecursive(categoryData as InsertData, ul, level + 1)
      parentUl.appendChild(li)
    }
  })
}

const createTreeSection = (title: string, level: number) => {
  const checkboxId = 'checkbox-' + Date.now() + '-' + Math.random()
  const levelClass = level > 0 ? ' level-' + level : ''

  const li = document.createElement('li')
  li.className = 'tree-section' + levelClass

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.id = checkboxId
  checkbox.checked = false // Default to collapsed

  const label = document.createElement('label')
  label.setAttribute('for', checkboxId)
  label.textContent = title

  // Add click handler to label to toggle checkbox
  label.addEventListener('click', (e) => {
    e.preventDefault()
    checkbox.checked = !checkbox.checked
  })

  const ul = document.createElement('ul')

  li.appendChild(checkbox)
  li.appendChild(label)
  li.appendChild(ul)

  return { li, ul }
}

const createTreeItem = (item: InsertItem) => {
  const li = document.createElement('li')

  const button = document.createElement('button')
  button.className = 'tree-item'

  // Build tooltip with description and quickType
  let tooltip = item.description || ''
  if (item.quickType) {
    tooltip += tooltip ? ` (Quick type: ${item.quickType})` : `Quick type: ${item.quickType}`
  }
  button.title = tooltip

  // Build button text
  let text = item.label ? item.label + ' - ' + (item.description || '') : (item.description || '')
  if (item.quickType) {
    text += ` [${item.quickType}]`
  }
  button.textContent = text

  button.addEventListener('click', () => {
    insertItem(item)
  })

  li.appendChild(button)
  return li
}

// Watch for insertData changes
watch(
  () => props.insertData,
  () => {
    initializeItems()
    nextTick(() => {
      buildTreeStructure()
    })
  },
  { immediate: true, deep: true }
)

// Watch for search term changes to rebuild tree when clearing search
watch(
  () => searchTerm.value,
  (newSearchTerm) => {
    // When search is cleared (empty), rebuild the tree
    if (!newSearchTerm.trim()) {
      nextTick(() => {
        buildTreeStructure()
      })
    }
  }
)
</script>

<style scoped>
.insert-tab {
  padding: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-container {
  margin-bottom: 12px;
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

.no-items {
  padding: 20px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.insert-item {
  padding: 8px;
  margin: 2px 0;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 3px;
  cursor: pointer;
  background: var(--vscode-editor-background);
  transition: border-color 0.2s ease;
}

.insert-item:hover {
  border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-hoverBackground);
}

.item-tag {
  font-weight: bold;
  color: var(--vscode-editor-foreground);
  font-size: 12px;
}

.item-label {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
}

.item-description {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
}

.item-quicktype {
  font-size: 10px;
  color: var(--vscode-textLink-foreground);
  margin-top: 2px;
  font-family: monospace;
  font-weight: 600;
}

.item-category {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
  opacity: 0.7;
}

.tree-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tree-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.collapse-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.collapse-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.tree-container {
  flex: 1;
  max-height: 400px;
  overflow-y: auto;
}

.tree-placeholder {
  padding: 20px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}

/* Tree styles */
:deep(.tree) {
  list-style: none;
  padding: 0;
  margin: 0;
}

:deep(.tree-section) {
  margin: 2px 0;
}

:deep(.tree-section > input[type="checkbox"]) {
  display: none;
}

:deep(.tree-section > label) {
  display: block;
  padding: 4px 8px;
  cursor: pointer;
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 3px;
  font-weight: bold;
  font-size: 11px;
  position: relative;
}

:deep(.tree-section > label:before) {
  content: '▶';
  margin-right: 6px;
  transition: transform 0.2s ease;
  display: inline-block;
}

:deep(.tree-section > input[type="checkbox"]:checked + label:before) {
  transform: rotate(90deg);
}

:deep(.tree-section > ul) {
  list-style: none;
  padding-left: 16px;
  margin: 4px 0 0 0;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

:deep(.tree-section > input[type="checkbox"]:checked + label + ul) {
  max-height: 1000px;
}

:deep(.tree-item) {
  display: block;
  width: 100%;
  padding: 4px 8px;
  margin: 1px 0;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 2px;
  cursor: pointer;
  font-size: 11px;
  color: var(--vscode-editor-foreground);
  text-align: left;
}

:deep(.tree-item:hover) {
  background: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}
</style>