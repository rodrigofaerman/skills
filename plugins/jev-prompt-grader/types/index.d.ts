export type Grade = 'Excellent' | 'Good' | 'Average' | 'Bad' | 'Horrible'

export type Verdict = {
  grade: Grade
  score: number
  confidence: number
  probs: Record<string, number>
  weakness: string
  tip: string
  prompt: string
  source: 'sent' | 'draft' | 'improved'
}

export type Busy = '' | 'grading' | 'draft' | 'improving'

declare module 'claude-code' {
  interface PluginState {
    'jev-prompt-grader': {
      latest: Verdict | null
      draft: Verdict | null
      improved: Verdict | null
      busy: Busy
      error: string
      log: Verdict[]
      autoRewrite: boolean
      isHidden: boolean
    }
  }
}
