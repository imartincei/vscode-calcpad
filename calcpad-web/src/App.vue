<template>
  <div class="app-layout">
    <div class="editor-pane">
      <div class="editor-toolbar">
        <template v-if="isNeutralino">
          <span class="file-name">{{ fileName || 'Untitled' }}</span>
          <span v-if="isDirty" class="dirty-indicator">*</span>
        </template>
        <span v-else>CalcPad Web</span>
        <span class="spacer"></span>
        <span
          class="server-status"
          :class="{ connected: serverConnected, disconnected: !serverConnected }"
        >
          {{ serverConnected ? 'Server connected' : 'Server disconnected' }}
        </span>
      </div>
      <div ref="editorContainer" class="editor-container"></div>
    </div>
    <div v-if="sidebarVisible" class="resize-handle"></div>
    <div v-if="sidebarVisible" class="sidebar-pane">
      <div id="vue-sidebar"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  isNeutralino?: boolean
}>()

const editorContainer = ref<HTMLElement | null>(null)
const serverConnected = ref(false)
const fileName = ref('')
const isDirty = ref(false)
const sidebarVisible = ref(true)

function setFileName(name: string): void {
  fileName.value = name
}

function setDirty(dirty: boolean): void {
  isDirty.value = dirty
}

function toggleSidebar(): void {
  sidebarVisible.value = !sidebarVisible.value
}

onMounted(async () => {
  const checkHealth = async () => {
    try {
      const bridge = (window as any).calcpadBridge
      if (bridge) {
        serverConnected.value = await bridge.api.checkHealth()
      }
    } catch {
      serverConnected.value = false
    }
  }

  setTimeout(checkHealth, 1000)
  setInterval(checkHealth, 30000)
})

defineExpose({ editorContainer, setFileName, setDirty, toggleSidebar })
</script>
