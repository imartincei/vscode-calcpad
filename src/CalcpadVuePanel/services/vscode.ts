// VSCode API service for Vue components

export interface VscodeApi {
  postMessage(message: any): void
}

let vscodeApi: VscodeApi | null = null

export function initVscodeApi(): VscodeApi {
  if (!vscodeApi) {
    vscodeApi = (window as any).vscode || (window as any).acquireVsCodeApi()
  }
  return vscodeApi!
}

export function getVscodeApi(): VscodeApi {
  if (!vscodeApi) {
    throw new Error('VSCode API not initialized. Call initVscodeApi() first.')
  }
  return vscodeApi
}

export function postMessage(message: any): void {
  getVscodeApi().postMessage(message)
}