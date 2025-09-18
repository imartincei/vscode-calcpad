/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// VS Code webview API
declare global {
  interface Window {
    vscode: {
      postMessage(message: any): void
    }
    insertData?: any
  }

  const acquireVsCodeApi: () => {
    postMessage(message: any): void
  }
}

export {}