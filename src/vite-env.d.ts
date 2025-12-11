/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_EXPERIENCE_TYPE?: 'story' | 'greeting-card' | 'both'
  readonly PROD: boolean
  readonly DEV: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

