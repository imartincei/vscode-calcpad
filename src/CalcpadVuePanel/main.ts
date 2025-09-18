import { createApp } from 'vue'
import CalcpadApp from './CalcpadApp.vue'
import './styles/base.css'
import { initVscodeApi } from './services/vscode'

// Initialize VS Code API
const vscode = (window as any).acquireVsCodeApi()

// Make vscode available globally
;(window as any).vscode = vscode

// Initialize our VSCode service
initVscodeApi()

// Create and mount the Vue app
const app = createApp(CalcpadApp)
app.mount('#app')

// Handle any global errors
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err, info)
  vscode.postMessage({
    type: 'debug',
    message: `Vue Error: ${err} - ${info}`
  })
}