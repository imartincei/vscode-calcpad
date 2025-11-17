<template>
  <div class="settings-tab">
    <div class="settings-container">
      <h3>Math Settings</h3>
      <div class="setting-group">
        <label for="decimals">Decimals:</label>
        <input
          id="decimals"
          v-model.number="localSettings.math.decimals"
          type="number"
          min="0"
          max="15"
          @input="updateSettings"
        />
      </div>

      <div class="setting-group">
        <label for="degrees">Degrees:</label>
        <input
          id="degrees"
          v-model.number="localSettings.math.degrees"
          type="number"
          min="0"
          max="360"
          @input="updateSettings"
        />
      </div>

      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.math.isComplex"
            type="checkbox"
            @change="updateSettings"
          />
          Complex Numbers
        </label>
      </div>

      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.math.substitute"
            type="checkbox"
            @change="updateSettings"
          />
          Substitute Variables
        </label>
      </div>

      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.math.formatEquations"
            type="checkbox"
            @change="updateSettings"
          />
          Format Equations
        </label>
      </div>

      <h3>Plot Settings</h3>
      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.plot.isAdaptive"
            type="checkbox"
            @change="updateSettings"
          />
          Adaptive Plotting
        </label>
      </div>

      <div class="setting-group">
        <label for="screenScaleFactor">Screen Scale Factor:</label>
        <input
          id="screenScaleFactor"
          v-model.number="localSettings.plot.screenScaleFactor"
          type="number"
          min="0.1"
          max="5"
          step="0.1"
          @input="updateSettings"
        />
      </div>

      <div class="setting-group">
        <label for="imagePath">Image Path:</label>
        <input
          id="imagePath"
          v-model="localSettings.plot.imagePath"
          type="text"
          @input="updateSettings"
        />
      </div>

      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.plot.vectorGraphics"
            type="checkbox"
            @change="updateSettings"
          />
          Vector Graphics
        </label>
      </div>

      <div class="setting-group">
        <label for="colorScale">Color Scale:</label>
        <select
          id="colorScale"
          v-model="localSettings.plot.colorScale"
          @change="updateSettings"
        >
          <option value="rainbow">Rainbow</option>
          <option value="grayscale">Grayscale</option>
          <option value="hot">Hot</option>
          <option value="cool">Cool</option>
        </select>
      </div>

      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.plot.smoothScale"
            type="checkbox"
            @change="updateSettings"
          />
          Smooth Scale
        </label>
      </div>

      <div class="setting-group">
        <label>
          <input
            v-model="localSettings.plot.shadows"
            type="checkbox"
            @change="updateSettings"
          />
          Shadows
        </label>
      </div>

      <div class="setting-group">
        <label for="lightDirection">Light Direction:</label>
        <input
          id="lightDirection"
          v-model="localSettings.plot.lightDirection"
          type="text"
          @input="updateSettings"
        />
      </div>

      <h3>Server Settings</h3>
      <div class="setting-group">
        <label for="serverUrl">Server URL:</label>
        <input
          id="serverUrl"
          v-model="localSettings.server.url"
          type="text"
          @input="updateSettings"
        />
      </div>

      <h3>Units</h3>
      <div class="setting-group">
        <label for="units">Units System:</label>
        <select
          id="units"
          v-model="localSettings.units"
          @change="updateSettings"
        >
          <option value="SI">SI (International System)</option>
          <option value="Imperial">Imperial</option>
          <option value="US">US Customary</option>
        </select>
      </div>

      <h3>Preview Theme</h3>
      <div class="setting-group">
        <label for="previewTheme">Theme:</label>
        <select
          id="previewTheme"
          v-model="previewTheme"
          @change="updatePreviewTheme"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <button @click="resetSettings" class="reset-button">
        Reset Settings
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Settings } from '../types'

// Props
interface Props {
  settings?: Settings
  initialPreviewTheme?: string
}

const props = withDefaults(defineProps<Props>(), {
  settings: () => ({
    math: {
      decimals: 2,
      degrees: 0,
      isComplex: false,
      substitute: true,
      formatEquations: true,
      zeroSmallMatrixElements: true,
      maxOutputCount: 20,
      formatString: ''
    },
    plot: {
      isAdaptive: true,
      screenScaleFactor: 2.0,
      imagePath: '',
      imageUri: '',
      vectorGraphics: false,
      colorScale: 'Rainbow',
      smoothScale: false,
      shadows: true,
      lightDirection: 'NorthWest'
    },
    server: {
      url: 'http://localhost:9420'
    },
    units: 'm'
  }),
  initialPreviewTheme: 'system'
})

// Emits
const emit = defineEmits<{
  updateSettings: [settings: Settings]
  updatePreviewTheme: [theme: string]
  resetSettings: []
}>()

// State
const localSettings = ref<Settings>({ ...props.settings })
const previewTheme = ref(props.initialPreviewTheme)

// Methods
const updateSettings = () => {
  emit('updateSettings', localSettings.value)
}

const updatePreviewTheme = () => {
  emit('updatePreviewTheme', previewTheme.value)
}

const resetSettings = () => {
  emit('resetSettings')
}

// Watch for prop changes
watch(
  () => props.settings,
  (newSettings) => {
    if (newSettings) {
      localSettings.value = { ...newSettings }
    }
  },
  { deep: true }
)

watch(
  () => props.initialPreviewTheme,
  (newTheme) => {
    previewTheme.value = newTheme
  }
)
</script>

<style scoped>
.settings-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
}

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
.setting-group input[type="text"],
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