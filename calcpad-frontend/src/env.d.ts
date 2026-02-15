/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PLATFORM: 'vscode' | 'electron' | 'web';
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
