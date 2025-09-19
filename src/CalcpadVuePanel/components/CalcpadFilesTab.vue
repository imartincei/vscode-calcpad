<template>
  <div class="files-tab">
    <div class="files-container p-3">
      <!-- Authentication Section -->
      <div v-if="!isAuthenticated" class="auth-section">
        <div class="login-form">
          <h3>Login to CalcPad S3</h3>
          <div class="form-group mb-3">
            <label>Username</label>
            <input
              v-model="loginForm.username"
              type="text"
              class="input"
              placeholder="Enter username"
              @keyup.enter="login"
            />
          </div>
          <div class="form-group mb-3">
            <label>Password</label>
            <input
              v-model="loginForm.password"
              type="password"
              class="input"
              placeholder="Enter password"
              @keyup.enter="login"
            />
          </div>
          <button @click="login" :disabled="loading" class="btn">
            {{ loading ? 'Logging in...' : 'Login' }}
          </button>
          <div v-if="error" class="error mt-2">{{ error }}</div>
        </div>
      </div>

      <!-- Main Interface -->
      <div v-else class="files-interface">
        <!-- Header with user info -->
        <div class="files-header mb-3">
          <div class="user-info">
            <span>Welcome, {{ currentUser?.username }}</span>
            <span class="role-badge">{{ getRoleName(currentUser?.role ?? 0) }}</span>
          </div>
          <div class="header-actions">
            <button v-if="canUpload" @click="showUploadModal = true" class="btn">
              Upload File
            </button>
            <button @click="logout" class="btn btn-secondary">
              Logout
            </button>
          </div>
        </div>

        <!-- Search and Filters -->
        <div class="search-filters mb-3">
          <div class="search-container">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search files..."
              class="input"
            />
          </div>
          <div class="filter-actions">
            <button @click="showTagFilterModal = true" class="btn btn-secondary">
              Filter by Tags
            </button>
            <button @click="refreshFiles" class="btn btn-secondary">
              Refresh
            </button>
          </div>
        </div>

        <!-- Files Grid -->
        <div v-if="loading" class="loading">Loading files...</div>
        <div v-else-if="filteredFiles.length === 0" class="no-files">
          No files found
        </div>
        <div v-else class="files-grid">
          <div
            v-for="file in filteredFiles"
            :key="file.fileName"
            class="file-card"
            @click="selectFile(file)"
          >
            <div class="file-icon">📄</div>
            <div class="file-info">
              <div class="file-name">{{ file.fileName }}</div>
              <div class="file-meta">
                <span>{{ formatFileSize(file.size) }}</span>
                <span>{{ formatDate(file.lastModified) }}</span>
              </div>
              <div v-if="file.tags && file.tags.length > 0" class="file-tags">
                <span
                  v-for="tag in file.tags"
                  :key="tag"
                  class="tag"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="file-actions">
              <button @click.stop="downloadFile(file)" class="btn-icon" title="Download">
                ⬇️
              </button>
              <button v-if="canUpload" @click.stop="editFileTags(file)" class="btn-icon" title="Edit Tags">
                🏷️
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Upload Modal -->
      <div v-if="showUploadModal" class="modal-overlay" @click="closeModals">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <h3>Upload File</h3>
            <button @click="closeModals" class="close-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group mb-3">
              <label>Select File</label>
              <input
                type="file"
                @change="handleFileSelect"
                class="input"
              />
            </div>
            <div class="form-group mb-3">
              <label>Tags (comma separated)</label>
              <input
                v-model="uploadTagsInput"
                type="text"
                class="input"
                placeholder="tag1, tag2, tag3"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button @click="uploadFile" :disabled="!selectedUploadFile || uploading" class="btn">
              {{ uploading ? 'Uploading...' : 'Upload' }}
            </button>
            <button @click="closeModals" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Tag Filter Modal -->
      <div v-if="showTagFilterModal" class="modal-overlay" @click="closeModals">
        <div class="modal" @click.stop>
          <div class="modal-header">
            <h3>Filter by Tags</h3>
            <button @click="closeModals" class="close-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="tags-list">
              <label v-for="tag in availableTags" :key="tag" class="tag-checkbox">
                <input
                  type="checkbox"
                  :value="tag"
                  v-model="selectedTagFilters"
                />
                {{ tag }}
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="applyTagFilter" class="btn">Apply Filter</button>
            <button @click="clearTagFilter" class="btn btn-secondary">Clear</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { postMessage } from '../services/vscode'
import type { S3File, S3User } from '../types'

// State
const isAuthenticated = ref(false)
const currentUser = ref<S3User | null>(null)
const authToken = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const uploading = ref(false)

// Forms
const loginForm = ref({
  username: '',
  password: ''
})

// Files
const files = ref<S3File[]>([])
const searchQuery = ref('')
const selectedTagFilters = ref<string[]>([])

// Modals
const showUploadModal = ref(false)
const showTagFilterModal = ref(false)

// Upload
const selectedUploadFile = ref<File | null>(null)
const uploadTagsInput = ref('')

// API configuration
const apiBaseUrl = ref('')

// Computed
const canUpload = computed(() => (currentUser.value?.role ?? 0) >= 2)
const isAdmin = computed(() => (currentUser.value?.role ?? 0) === 3)

const filteredFiles = computed(() => {
  let filtered = files.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(file =>
      file.fileName.toLowerCase().includes(query)
    )
  }

  // Tag filter
  if (selectedTagFilters.value.length > 0) {
    filtered = filtered.filter(file => {
      if (!file.tags || file.tags.length === 0) return false
      return selectedTagFilters.value.some(tag => file.tags?.includes(tag) ?? false)
    })
  }

  return filtered
})

const availableTags = computed(() => {
  const tags = new Set<string>()
  files.value.forEach(file => {
    if (file.tags) {
      file.tags.forEach((tag: string) => tags.add(tag))
    }
  })
  return Array.from(tags).sort()
})

// Methods
const login = async () => {
  loading.value = true
  error.value = null

  // Send login request to VS Code extension
  postMessage({
    type: 's3Login',
    credentials: loginForm.value
  })
}

const logout = () => {
  isAuthenticated.value = false
  currentUser.value = null
  authToken.value = null
  files.value = []
  localStorage.removeItem('calcpad_s3_token')
}

const loadFiles = async () => {
  if (!authToken.value) return

  loading.value = true
  postMessage({
    type: 'debug',
    message: `[Vue] Loading files with token: ${authToken.value ? `${authToken.value.substring(0, 20)}...` : 'EMPTY'}`
  })
  postMessage({
    type: 's3ListFiles',
    token: authToken.value
  })
}

const refreshFiles = () => {
  loadFiles()
}

const downloadFile = async (file: S3File) => {
  if (!authToken.value) return

  postMessage({
    type: 's3DownloadFile',
    fileName: file.fileName,
    token: authToken.value
  })
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  selectedUploadFile.value = target.files?.[0] || null
}

const uploadFile = async () => {
  if (!selectedUploadFile.value || !authToken.value) return

  uploading.value = true

  // Convert file to base64 for message passing
  const reader = new FileReader()
  reader.onload = () => {
    const base64Data = reader.result as string
    const tags = uploadTagsInput.value.trim() ?
      uploadTagsInput.value.split(',').map(t => t.trim()).filter(t => t) : []

    postMessage({
      type: 's3UploadFile',
      fileName: selectedUploadFile.value!.name,
      fileData: base64Data,
      tags: tags,
      token: authToken.value
    })
  }
  reader.readAsDataURL(selectedUploadFile.value)
}

const selectFile = (file: any) => {
  // Handle file selection if needed
}

const editFileTags = (file: any) => {
  // TODO: Implement tag editing modal
}

const closeModals = () => {
  showUploadModal.value = false
  showTagFilterModal.value = false
  selectedUploadFile.value = null
  uploadTagsInput.value = ''
}

const applyTagFilter = () => {
  closeModals()
}

const clearTagFilter = () => {
  selectedTagFilters.value = []
  closeModals()
}

const getRoleName = (role: number) => {
  switch (role) {
    case 1: return 'Viewer'
    case 2: return 'Contributor'
    case 3: return 'Admin'
    default: return 'Unknown'
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

// Initialize
onMounted(() => {
  // Check for stored token
  const storedToken = localStorage.getItem('calcpad_s3_token')
  if (storedToken) {
    authToken.value = storedToken
    // TODO: Verify token and load user info
  }

  // Request S3 config from VS Code settings
  postMessage({ type: 'getS3Config' })
})

// Listen for messages from VS Code
window.addEventListener('message', (event) => {
  const message = event.data

  switch (message.type) {
    case 's3ConfigResponse':
      if (message.apiUrl) {
        apiBaseUrl.value = message.apiUrl
      } else {
        error.value = 'S3 API URL not configured. Please set calcpad.s3.apiUrl in VS Code settings.'
      }
      break

    case 's3LoginResponse':
      loading.value = false
      if (message.success) {
        authToken.value = message.token
        currentUser.value = message.user
        isAuthenticated.value = true
        localStorage.setItem('calcpad_s3_token', message.token)
        loadFiles()
      } else {
        error.value = message.error || 'Login failed'
      }
      break

    case 's3FilesResponse':
      loading.value = false
      postMessage({
        type: 'debug',
        message: `[Vue] Received s3FilesResponse: success=${message.success}, files=${JSON.stringify(message.files)}`
      })
      if (message.success) {
        files.value = message.files || []
        postMessage({
          type: 'debug',
          message: `[Vue] Updated files array with ${files.value.length} files`
        })
        error.value = null
      } else {
        error.value = message.error || 'Failed to load files'
        postMessage({
          type: 'debug',
          message: `[Vue] Files load failed: ${error.value}`
        })
      }
      break

    case 's3UploadResponse':
      uploading.value = false
      if (message.success) {
        closeModals()
        loadFiles()
        error.value = null
      } else {
        error.value = message.error || 'Upload failed'
      }
      break

    case 's3DownloadResponse':
      if (message.success && message.fileData) {
        // Create blob and trigger download
        const byteCharacters = atob(message.fileData.split(',')[1])
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray])

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = message.fileName
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        error.value = message.error || 'Download failed'
      }
      break

    case 's3Error':
      loading.value = false
      uploading.value = false
      error.value = message.error || 'S3 operation failed'
      break
  }
})
</script>

<style scoped>
.files-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.files-container {
  overflow-y: auto;
  height: 100%;
}

.auth-section {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.login-form {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  padding: 20px;
  width: 100%;
  max-width: 300px;
}

.login-form h3 {
  margin-bottom: 16px;
  text-align: center;
  color: var(--vscode-foreground);
}

.files-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-badge {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 10px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.search-filters {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-container {
  flex: 1;
}

.filter-actions {
  display: flex;
  gap: 8px;
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.file-card {
  background: var(--vscode-list-inactiveSelectionBackground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-card:hover {
  background: var(--vscode-list-hoverBackground);
}

.file-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: bold;
  font-size: 13px;
  margin-bottom: 4px;
  word-break: break-word;
}

.file-meta {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}

.file-meta span {
  margin-right: 12px;
}

.file-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 2px;
}

.file-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 2px;
  font-size: 14px;
}

.btn-icon:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  padding: 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--vscode-foreground);
}

.modal-body {
  padding: 16px;
}

.modal-footer {
  padding: 16px;
  border-top: 1px solid var(--vscode-widget-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.tags-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.loading,
.no-files {
  text-align: center;
  color: var(--vscode-descriptionForeground);
  padding: 40px 20px;
  font-style: italic;
}

.error {
  color: var(--vscode-errorForeground);
  font-size: 12px;
}

.mt-2 { margin-top: 8px; }
.mb-3 { margin-bottom: 12px; }
</style>