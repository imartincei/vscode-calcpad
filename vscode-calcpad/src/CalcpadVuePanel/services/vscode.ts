// VSCode API service for Vue components

export interface VscodeApi {
  postMessage(message: unknown): void
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

// Helper function to serialize Vue reactive objects safely
function serializeForPostMessage(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeForPostMessage(item))
  }

  if (typeof obj === 'object') {
    const serialized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeForPostMessage(value)
    }
    return serialized
  }

  return obj
}

export function postMessage(message: unknown): void {
  const serializedMessage = serializeForPostMessage(message)
  getVscodeApi().postMessage(serializedMessage)
}