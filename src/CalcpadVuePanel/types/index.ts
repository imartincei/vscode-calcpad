// Type definitions for CalcpadVuePanel

export interface InsertItem {
  label?: string
  tag: string
  description?: string
  categoryPath?: string
  category?: string
  quickType?: string
}

export interface InsertCategory {
  direct?: InsertItem[]
  [key: string]: InsertItem[] | InsertCategory | undefined
}

export interface InsertData {
  [key: string]: InsertCategory
}

export interface Settings {
  math: {
    decimals: number
    degrees: number
    isComplex: boolean
    substitute: boolean
    formatEquations: boolean
    zeroSmallMatrixElements: boolean
    maxOutputCount: number
    formatString: string
  }
  plot: {
    isAdaptive: boolean
    screenScaleFactor: number
    imagePath: string
    imageUri: string
    vectorGraphics: boolean
    colorScale: string
    smoothScale: boolean
    shadows: boolean
    lightDirection: string
  }
  server: {
    url: string
  }
  units: string
}

export interface VariableItem {
  name: string
  definition?: string
  content?: string
  source?: string
  params?: string
}

export interface VariablesData {
  macros: VariableItem[]
  variables: VariableItem[]
  functions: VariableItem[]
  customUnits: VariableItem[]
}

export interface S3User {
  username: string
  id: string
}

export interface S3File {
  fileName: string
  size: number
  lastModified: string
}

export interface S3State {
  isAuthenticated: boolean
  authToken: string | null
  currentUser: S3User | null
  apiUrl: string
  files: S3File[]
  loading: boolean
  error: string | null
  searchQuery: string
}

export interface Tab {
  id: string
  label: string
  icon?: string
}

// VS Code message types
export interface VscodeMessage {
  type: string
  [key: string]: any
}

export interface PdfSettings {
  enableHeader: boolean
  documentTitle: string
  documentSubtitle: string
  headerCenter: string
  author: string
  enableFooter: boolean
  footerCenter: string
  company: string
  project: string
  showPageNumbers: boolean
  format: string
  orientation: string
  marginTop: string
  marginBottom: string
  marginLeft: string
  marginRight: string
  printBackground: boolean
  scale: number
}

// S3 File Management Types
export interface S3File {
  fileName: string
  size: number
  lastModified: string
  tags?: string[]
}

export interface S3User {
  id: string
  username: string
  email: string
  role: number
}

export interface S3Config {
  apiBaseUrl: string
  minio: {
    endpoint: string
    useSSL: boolean
  }
  fileUpload: {
    maxFileSize: number
  }
  ui: {
    defaultTab: string
    filesPerPage: number
  }
}