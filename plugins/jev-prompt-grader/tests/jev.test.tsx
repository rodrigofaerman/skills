import { expect, test } from 'claude-code/testing'

const BAND = { plugin: 'jev-prompt-grader', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false } } as const
const PANE = {
  plugin: 'jev-prompt-grader', component: 'Pane', requestId: 'jev', surface: 'desktop',
  props: { title: 'JEV', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

const reply = (choice: string) =>
  JSON.stringify({ data: { results: [{ response: { data: { answers: {
    quality: { choice, confidence: 0.7, probabilities: { [choice]: 1 }, type: 'choice' },
    weakness: { choice: 'context', confidence: 0.6, type: 'choice' },
  } } } }] } })

function engine(on: any, grade: string, sent: string[]) {
  on('mcp.call', () => ({ value: { content: [{ type: 'text', text: reply(grade) }], isError: false } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'REWRITTEN PROMPT', usage: {} } }))
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('clock.after', () => ({ value: {} }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
}

test('a non-Excellent prompt is rewritten and sent in its place', async ($, on) => {
  const sent: string[] = []
  engine(on, 'Bad', sent)
  await $.prompt.submit({ text: 'make an agent for my social media please' })
  expect(sent).toEqual(['REWRITTEN PROMPT'])

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect((await band.find({ type: 'Text', text: /JEV/ }))?.text).toContain('Bad')
  await band.unmount()

  const pane = await $.ui.mount(PANE as never)
  expect((await pane.find({ type: 'Text', text: /Weakness/ }))?.text).toContain('missing context')
  await pane.unmount()
})

test('an Excellent prompt is sent unchanged', async ($, on) => {
  const sent: string[] = []
  engine(on, 'Excellent', sent)
  await $.prompt.submit({ text: 'a very detailed and excellent prompt with all context' })
  expect(sent).toEqual(['a very detailed and excellent prompt with all context'])
})

test('short replies and slash commands are not rewritten', async ($, on) => {
  const sent: string[] = []
  engine(on, 'Bad', sent)
  await $.prompt.submit({ text: 'yes, all accounts' })
  await $.prompt.submit({ text: '/help' })
  expect(sent).toEqual(['yes, all accounts', '/help'])
})
