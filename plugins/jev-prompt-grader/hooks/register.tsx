import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpContentBlock, Register } from 'claude-code'

import type { Busy, Grade, Verdict } from '../types'

const PANE = 'jev'
const last = atom({ plugin: 'jev-prompt-grader', key: 'latest' } as const, null)
const draft = atom({ plugin: 'jev-prompt-grader', key: 'draft' } as const, null)
const improved = atom({ plugin: 'jev-prompt-grader', key: 'improved' } as const, null)
const busy = atom({ plugin: 'jev-prompt-grader', key: 'busy' } as const, '')
const error = atom({ plugin: 'jev-prompt-grader', key: 'error' } as const, '')
const history = atom({ plugin: 'jev-prompt-grader', key: 'log' } as const, [])
const autoRewrite = atom({ plugin: 'jev-prompt-grader', key: 'autoRewrite' } as const, true)
const isHidden = atom({ plugin: 'jev-prompt-grader', key: 'isHidden' } as const, false)

const GRADES: readonly Grade[] = ['Excellent', 'Good', 'Average', 'Bad', 'Horrible']
const ICON: Record<Grade, string> = { Excellent: '🟢', Good: '🔵', Average: '🟡', Bad: '🟠', Horrible: '🔴' }
const COLOR: Record<Grade, string> = { Excellent: 'green', Good: 'cyan', Average: 'yellow', Bad: 'magenta', Horrible: 'red' }
const VALUE: Record<Grade, number> = { Excellent: 10, Good: 7.5, Average: 5, Bad: 2.5, Horrible: 0 }

// JEV (TypeSafe AI, via Composio): two "choice" questions graded in parallel.
const QUESTIONS = {
  quality: {
    type: 'choice',
    instructions:
      "The state is a prompt a user sent to an AI coding assistant. Judge the prompt's quality as an instruction: clarity of goal, context, specificity, success criteria, concision. Do not answer the prompt.",
    criteria: {
      Excellent: 'Clear goal, rich context, specific constraints and output format, explicit success criteria; nothing ambiguous.',
      Good: 'Clear goal and enough context; minor gaps the assistant can fill sensibly.',
      Average: 'Goal understandable but missing important context, constraints or success criteria.',
      Bad: 'Vague or ambiguous; the assistant must guess most of what is wanted.',
      Horrible: 'Incomprehensible, contradictory, empty or no actionable request.',
    },
  },
  weakness: {
    type: 'choice',
    instructions: 'The state is a prompt sent to an AI coding assistant. Pick the single biggest weakness of the prompt.',
    criteria: {
      goal: 'The goal or desired outcome is unclear.',
      context: 'Missing background: files, systems, names, definitions or why it is needed.',
      specificity: 'Missing concrete details, constraints, examples or the expected output format.',
      success: 'No way to tell when the task is done; no acceptance criteria.',
      noise: 'Rambling, contradictory or ambiguous wording.',
      none: 'No meaningful weakness; the prompt is already strong.',
    },
  },
} as const

const TIPS: Record<string, string> = {
  goal: 'State in one sentence the outcome you want.',
  context: 'Add context: files, systems, terms (e.g. what X is) and why.',
  specificity: 'Be specific: constraints, examples and the expected output format.',
  success: 'Say how to tell it is done (acceptance criteria).',
  noise: 'Cut noise and ambiguity; one instruction per sentence.',
  none: 'Prompt is already strong — keep it up.',
}
const WEAK_LABEL: Record<string, string> = {
  goal: 'unclear goal',
  context: 'missing context',
  specificity: 'lacks specificity',
  success: 'no success criteria',
  noise: 'noise/ambiguity',
  none: 'no notable weakness',
}

type ChoiceAnswer = { choice?: string; confidence?: number; probabilities?: Record<string, number> }

function findAnswers(x: unknown): Record<string, ChoiceAnswer> | undefined {
  if (x === null || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  if (o.answers && typeof o.answers === 'object') return o.answers as Record<string, ChoiceAnswer>
  for (const v of Object.values(o)) {
    const f = findAnswers(v)
    if (f) return f
  }
  return undefined
}

function toVerdict(raw: string, prompt: string, source: Verdict['source']): Verdict | undefined {
  let answers: Record<string, ChoiceAnswer> | undefined
  try {
    answers = findAnswers(JSON.parse(raw))
  } catch {
    return undefined
  }
  const q = answers?.quality
  const grade = GRADES.find(g => g === q?.choice)
  if (!grade) return undefined
  const weak = answers?.weakness?.choice ?? 'none'
  const probs = q?.probabilities ?? {}
  let score = GRADES.reduce((s, g) => s + (probs[g] ?? 0) * VALUE[g], 0)
  if (!Object.keys(probs).length) score = VALUE[grade]
  return {
    grade,
    score: Math.round(score * 10) / 10,
    confidence: q?.confidence ?? 0,
    probs,
    weakness: weak,
    tip: TIPS[weak] ?? '',
    prompt: prompt.slice(0, 2000),
    source,
  }
}

async function askJev($: EngineInterface, text: string, source: Verdict['source']) {
  const res = await $.mcp.call('Composio', 'COMPOSIO_MULTI_EXECUTE_TOOL', {
    sync_response_to_workbench: false,
    thought: 'Classify prompt quality with JEV.',
    current_step: 'JEV_GRADE_PROMPT',
    tools: [
      { tool_slug: 'JEV_EVALUATE_STATE', arguments: { model: 'jev-latest', state: text.slice(0, 8000), questions: QUESTIONS } },
    ],
  })
  if (res.isError) return undefined
  const raw = res.content.map((c: McpContentBlock) => (c.type === 'text' ? c.text : '')).join('')
  return toVerdict(raw, text, source)
}

const IMPROVE = `You rewrite prompts for an AI coding/agent assistant.
Rewrite the PROMPT below so it grades Excellent: clear goal, context, specific details,
expected output format and success criteria. Keep the original intent and the original language.
Do not invent facts: where information only the user knows is missing, use bracketed placeholders, e.g. [which social networks].
Be concise (about 150 words max). Reply ONLY with the rewritten prompt, no commentary.`

async function grade($: EngineInterface, text: string, source: Verdict['source']) {
  try {
    return await askJev($, text, source)
  } catch {
    return undefined
  }
}

function bar(p: number, width = 14) {
  const n = Math.round(p * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

function runLater($: EngineInterface, kind: Busy, job: () => Promise<void>) {
  $.clock.after(0, async () => {
    await update($, busy, () => kind)
    await update($, error, () => '')
    try {
      await job()
    } catch (err) {
      await update($, error, () => `Falhou: ${String(err).slice(0, 120)}`)
    }
    await update($, busy, () => '')
  })
}

function evaluateDraft($: EngineInterface) {
  return runLater($, 'draft', async () => {
    const box = await $.prompt.read()
    const text = box.text.trim()
    if (!text) {
      await update($, error, () => 'The prompt box is empty: type a draft first.')
      return
    }
    const v = await grade($, text, 'draft')
    if (!v) throw new Error('JEV did not answer')
    await update($, draft, () => v)
    await update($, improved, () => null)
  })

}

async function makeImproved($: EngineInterface): Promise<Verdict | undefined> {
  const base = (await read($, draft)) ?? (await read($, last))
  if (!base) return undefined
  const r = await $.model.complete({
    model: 'sonnet',
    system: IMPROVE,
    prompt: `Biggest weakness flagged by JEV: ${WEAK_LABEL[base.weakness] ?? base.weakness}.\n\nPROMPT:\n<<<\n${base.prompt}\n>>>`,
    maxTokens: 800,
  })
  if (!r.isAnswered) throw new Error(`model did not answer (${r.reason})`)
  const text = r.text.trim()
  const v: Verdict = (await grade($, text, 'improved')) ?? { ...base, prompt: text, source: 'improved', score: NaN }
  await update($, improved, () => v)
  return v
}

function improve($: EngineInterface) {
  return runLater($, 'improving', async () => {
    const v = await makeImproved($)
    if (!v) await update($, error, () => 'Nothing to improve yet: send or grade a prompt.')
  })
}

const AUTO_REWRITE = (text: string, weakness: string) => `Rewrite my NEXT message (below) into an Excellent prompt for you, the assistant, before you act on it.
Use this conversation as context so the rewrite keeps exactly what I mean (resolve references like "that", "yes", "the accounts" into explicit terms).
Fix the biggest weakness flagged by JEV: ${weakness}. Add a clear goal, the relevant context, specifics, expected output format and success criteria.
Keep my intent, my voice (first person, addressed to the assistant) and my language. Do not invent facts or add placeholders; where something is unknown, state it as an assumption or ask for it in the prompt.
Do not answer or perform the request. Reply ONLY with the rewritten prompt.

MY NEXT MESSAGE:
<<<
${text}
>>>`

async function rewrite($: EngineInterface, text: string, weakness: string): Promise<string | undefined> {
  const ask = AUTO_REWRITE(text, WEAK_LABEL[weakness] ?? weakness)
  let r: { isAnswered: boolean; text?: string } = await $.model.fork({ prompt: ask })
  if (!r.isAnswered) r = await $.model.complete({ model: 'sonnet', prompt: ask, maxTokens: 1200 })
  const out = r.isAnswered ? (r.text ?? '').trim() : ''
  return out.length > 0 ? out : undefined
}

async function say($: EngineInterface, text: string) {
  try {
    await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
  } catch {
    // no transcript on this surface: band/status remain
  }
}

function notice(v: Verdict) {
  const pct = Math.round(v.confidence * 100)
  return `JEV ${ICON[v.grade]} ${v.grade} · ${v.score}/10 (confidence ${pct}%) · weakness: ${WEAK_LABEL[v.weakness] ?? v.weakness}\nTip: ${v.tip}  →  /jev improve for a better version`
}

async function useImproved($: EngineInterface) {
  const v = await read($, improved)
  if (!v) return
  await $.prompt.fill({ text: v.prompt, mode: 'replace' })
  $.ui.toast('Improved version placed in the prompt box: review and send.')
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jev',
      description: 'JEV: /jev pane · /jev improve · /jev history · /jev auto on|off · /jev hide|show',
    })
    void $.ui.open({ id: PANE, title: 'JEV · prompt quality' })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (e.command || e.isMeta || text.length === 0 || text.startsWith('/')) return next(e)

    await update($, busy, () => 'grading')
    $.ui.status('JEV: grading prompt…')
    const v = await grade($, text, 'sent')
    if (!v) {
      await update($, busy, () => '')
      await update($, error, () => 'JEV did not answer for the last prompt (check the Composio connection).')
      $.ui.status('JEV: could not grade')
      return next(e)
    }
    await update($, error, () => '')
    await update($, last, () => v)
    await update($, draft, () => null)
    await update($, improved, () => null)
    await update($, history, h => [v, ...h].slice(0, 50))
    $.ui.status(`JEV ${ICON[v.grade]} ${v.grade} (${v.score}/10)`)

    const words = text.split(/\s+/).length
    const shouldRewrite = (await read($, autoRewrite)) && v.grade !== 'Excellent' && words >= 6
    if (!shouldRewrite) {
      await update($, busy, () => '')
      $.clock.after(0, () => void say($, notice(v)))
      return next(e)
    }

    await update($, busy, () => 'improving')
    $.ui.status(`JEV ${ICON[v.grade]} ${v.grade}: rewriting…`)
    let better: string | undefined
    try {
      better = await rewrite($, text, v.weakness)
    } catch {
      better = undefined
    }
    await update($, busy, () => '')
    if (!better) {
      $.clock.after(0, () => void say($, `${notice(v)}\n(rewrite failed: your original prompt was sent)`))
      return next(e)
    }

    $.clock.after(0, async () => {
      const v2 = await grade($, better!, 'improved')
      if (v2) await update($, improved, () => v2)
      const after = v2 ? `${ICON[v2.grade]} ${v2.grade} ${v2.score}/10` : 'not graded'
      $.ui.status(`JEV ${ICON[v.grade]} ${v.score} → ${after}`)
      await say(
        $,
        `JEV ${ICON[v.grade]} ${v.grade} ${v.score}/10 → rewritten ${after} · weakness: ${WEAK_LABEL[v.weakness] ?? v.weakness}\n` +
          `Sent in place of your text:\n${better}\n\nYour original: ${text}\n(/jev auto off to stop rewriting)`,
      )
    })
    return next({ ...e, text: better })
  })

  on('command.run', { command: 'jev' }, async ($, e) => {
    const arg = (e.args ?? '').trim()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      return { text: arg === 'hide' ? 'JEV band hidden.' : 'JEV band shown.' }
    }
    if (arg === 'auto on' || arg === 'auto off' || arg === 'auto') {
      const enabled = arg !== 'auto off'
      await update($, autoRewrite, () => enabled)
      return { text: enabled ? 'JEV auto-rewrite ON: prompts below Excellent are rewritten before sending.' : 'JEV auto-rewrite OFF: prompts are only graded.' }
    }
    if (arg === 'improve' || arg === 'melhorar') {
      const base = (await read($, draft)) ?? (await read($, last))
      if (!base) return { text: 'JEV has not graded any prompt yet: send one first.' }
      let v: Verdict | undefined
      try {
        v = await makeImproved($)
      } catch (err) {
        return { text: `JEV: could not improve (${String(err).slice(0, 120)})` }
      }
      if (!v) return { text: 'Nothing to improve.' }
      try {
        await $.prompt.fill({ text: v.prompt, mode: 'replace' })
      } catch {
        // no prompt box
      }
      const after = Number.isNaN(v.score) ? '' : ` → ${ICON[v.grade]} ${v.grade} ${v.score}/10`
      return {
        text: `JEV — improved version (${ICON[base.grade]} ${base.grade} ${base.score}/10${after})\n\n${v.prompt}\n\nPlaced in the prompt box (if this interface allows): fill in the [brackets] and send.`,
      }
    }
    if (arg === 'history' || arg === 'hist') {
      const h = await read($, history)
      if (h.length === 0) return { text: 'JEV has not graded any prompt in this session yet.' }
      const counts = GRADES.map(g => `${ICON[g]} ${g}: ${h.filter(v => v.grade === g).length}`).join('  ')
      const avg = (h.reduce((s, v) => s + v.score, 0) / h.length).toFixed(1)
      const lines = h.slice(0, 10).map(v => `${ICON[v.grade]} ${v.grade.padEnd(9)} ${String(v.score).padStart(4)}  "${v.prompt.slice(0, 70)}"`)
      return { text: `JEV — ${h.length} prompts, average ${avg}/10\n${counts}\n\n${lines.join('\n')}` }
    }
    const r = await $.ui.open({ id: PANE, title: 'JEV · prompt quality', focus: true })
    return { text: r.isPlaced ? 'JEV pane opened.' : 'JEV pane opened (this interface may not show panes; use /jev history).' }
  })

  // Compact band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const b = await read($, busy)
    const v = await read($, last)
    if (!b && v === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    if (b === 'grading') return <Box><Text dimColor>JEV grading the prompt…</Text></Box>
    if (!v) return next(e)
    return (
      <Box>
        <Text color={COLOR[v.grade]} bold>JEV {ICON[v.grade]} {v.grade} ({v.score}/10)</Text>
        <Text dimColor> — {WEAK_LABEL[v.weakness] ?? v.weakness} · /jev improve for a better version</Text>
      </Box>
    )
  })

  // Side pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, busy)
    const err = await read($, error)
    const sent = await read($, last)
    const dr = await read($, draft)
    const imp = await read($, improved)
    const hist = await read($, history)
    const cur = dr ?? sent
    const width = Math.max(20, (e.props.bodyColumns ?? 40) - 2)

    const card = (v: Verdict, title: string) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{title}</Text>
        <Text color={COLOR[v.grade]} bold>
          {ICON[v.grade]} {v.grade} · {Number.isNaN(v.score) ? '—' : `${v.score}/10`} · confidence {Math.round(v.confidence * 100)}%
        </Text>
        {GRADES.map(g => (
          <Text color={g === v.grade ? COLOR[g] : undefined} dimColor={g !== v.grade}>
            {g.padEnd(9)} {bar(v.probs[g] ?? 0)} {String(Math.round((v.probs[g] ?? 0) * 100)).padStart(3)}%
          </Text>
        ))}
        <Text>Weakness: <Text bold>{WEAK_LABEL[v.weakness] ?? v.weakness}</Text></Text>
        <Text dimColor>Tip: {v.tip}</Text>
        <Text dimColor wrap="truncate-end">“{v.prompt.replace(/\s+/g, ' ').slice(0, width * 2)}”</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        {b !== '' && <Text color="yellow">⏳ JEV {b === 'improving' ? 'writing an improved version…' : 'grading…'}</Text>}
        {err !== '' && <Text color="red">{err}</Text>}

        {cur ? card(cur, dr ? 'Draft (not sent yet)' : 'Last prompt sent') : (
          <Text dimColor>Send a prompt, or type a draft and press “Grade draft”.</Text>
        )}

        {imp && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>
              Improved version {cur && !Number.isNaN(imp.score) ? `(${cur.score} → ${imp.score})` : ''}
            </Text>
            <Text color={COLOR[imp.grade]}>{ICON[imp.grade]} {imp.grade}{Number.isNaN(imp.score) ? '' : ` · ${imp.score}/10`}</Text>
            <Text>{imp.prompt}</Text>
          </Box>
        )}

        <Box flexDirection="column">
          <Button key="draft" hotkey="g" label="Grade draft" onPress={() => evaluateDraft($)} />
          {cur && <Button key="improve" hotkey="i" label="Improve prompt" onPress={() => improve($)} />}
          {imp && <Button key="use" hotkey="u" label="Use improved version" onPress={() => useImproved($)} />}
        </Box>

        {hist.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>
              History · average {(hist.reduce((s, v) => s + v.score, 0) / hist.length).toFixed(1)}/10
            </Text>
            {hist.slice(0, 6).map(v => (
              <Text dimColor wrap="truncate-end">
                {ICON[v.grade]} {String(v.score).padStart(4)} {v.prompt.replace(/\s+/g, ' ').slice(0, width - 8)}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
