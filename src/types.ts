export type Range = { start: number; end: number }

export type RelativeRegion = { x: number; y: number; width: number; height: number }

export type ResultState = {
  message: string
  status: 'neutral' | 'loading' | 'success' | 'error'
}

export type ValidationHistoryEntry = {
  id: number
  amount: string
  serie: string
  isOk: boolean
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type AppMode = 'manual' | 'automatic'
