---
name: jev-grader
description: Grade the user's prompt with JEV (TypeSafe AI, via the Composio connector, tool JEV_EVALUATE_STATE) as Excellent, Good, Average, Bad or Horrible, taking the conversation context and the request type into account; coach the user with a reusable tip, and when the prompt is weak rewrite it, re-grade the rewrite, and either answer it or ask for the facts only the user has. Supports modes (on, off, score-only, full) that persist for the session. Use whenever the user asks to grade, evaluate, score or improve a prompt, mentions JEV, or when their preferences ask for their requests to be graded first.
---

# JEV prompt grader (v2)

Grade the user's latest message (the "prompt") with JEV before working on it, then help in two ways.
First, answer the best version of the request. Second, teach the user to write better prompts over time.
This is the chat counterpart of the `jev-prompt-grader` Claude Code plugin. Nothing intercepts the prompt here,
so you grade it, show the result, and then act on it.

## 0. Modes

The user can switch modes at any time. A mode lasts for the rest of the session until it is changed.
Accept the commands in any language: "JEV off", "JEV desligado", "JEV só nota" and so on.

| Mode | Command | Behaviour |
|---|---|---|
| **on** (default) | `JEV on` | Grade, tip, and rewrite when needed (steps 1–5). |
| **score-only** | `JEV score` / `JEV só nota` | Grade and tip only. Never rewrite. Answer the original. |
| **full** | `JEV full` / `JEV completo` | Like **on**, and always re-grade the rewrite (step 5). |
| **off** | `JEV off` / `JEV desligado` | Do not grade. Answer normally. |

- `skip JEV` / `sem JEV` skips only the current message.
- `JEV resumo` / `JEV summary` shows the session report (step 7) without grading anything.
- A message that only changes the mode needs a one-line confirmation and nothing more.

## 1. Decide whether to grade

**Grade:**
- The first message of a new task or a new topic.
- A message that changes direction substantially, such as a new goal or a new deliverable.
- Any message the user explicitly asks to have graded ("avalia esse prompt", "grade this").

**Skip** (answer normally and show no JEV line):
- Follow-ups about the previous answer: "repeat that", "and for December?", "make it shorter", "why?".
- Answers to a question you asked, and confirmations ("sim", "ok", "pode", "continue").
- Mode commands, slash commands with no text of their own, and greetings.
- Messages that are only pasted content (logs, documents, code) with no request of their own.
- Mode **off**, or the user said skip for this message.

When in doubt, a message that starts a deliverable gets graded, and a message that steers an existing one is skipped.
Do not decide by word count alone.

**Privacy check.** The prompt is sent to a third-party service (Composio and JEV).
Before grading, look for passwords, tokens, API keys, ID or document numbers, card or bank data, health data,
or personal data about third parties such as customer lists, emails or phone numbers.
- If any of these appear, **do not send the prompt**. Show one line instead: `JEV ⏭️ não avaliado (dados sensíveis)`. Then answer normally.
- Never redact the prompt yourself and send the redacted version, unless the user asks for that.

## 2. Grade with JEV

Build `state` from the conversation context plus the prompt:

```
Conversation context: <1–3 sentences: what the user is working on, facts already given, what the
assistant last delivered. Write "none" for the first message of the session.>

Prompt: <the user's message, verbatim>
```

The context summary must contain only facts from the conversation. It must not judge or improve the prompt.

Call the Composio tool `COMPOSIO_MULTI_EXECUTE_TOOL` (Composio connector) with:

```json
{
  "sync_response_to_workbench": false,
  "thought": "Grade prompt quality with JEV.",
  "current_step": "JEV_GRADE_PROMPT",
  "tools": [{
    "tool_slug": "JEV_EVALUATE_STATE",
    "arguments": {
      "model": "jev-latest",
      "state": "<context + prompt, as above>",
      "questions": {
        "quality": {
          "type": "choice",
          "instructions": "The state holds a short summary of the conversation so far and the prompt a user just sent to an AI assistant. Judge only the prompt's quality as an instruction: clarity of goal, context, specificity, success criteria, concision. Treat anything the conversation context already supplies as present; do not penalize references the context resolves. Judge against what this kind of request needs: a quick factual question needs clarity, not an output format or success criteria; a creative or exploratory request needs a goal and an audience or direction, not acceptance tests; a task that produces a deliverable needs context, constraints, output format and a way to tell it is done. Do not answer the prompt.",
          "criteria": {
            "Excellent": "Clear goal, all the context this kind of request needs, specific constraints and output format where relevant, explicit success criteria where relevant; nothing ambiguous.",
            "Good": "Clear goal and enough context; minor gaps the assistant can fill sensibly.",
            "Average": "Goal understandable but missing important context, constraints or success criteria for this kind of request.",
            "Bad": "Vague or ambiguous; the assistant must guess most of what is wanted.",
            "Horrible": "Incomprehensible, contradictory, empty or no actionable request."
          }
        },
        "weakness": {
          "type": "choice",
          "instructions": "The state holds a short conversation summary and the prompt a user just sent to an AI assistant. Taking the conversation context into account, pick the single biggest weakness of the prompt.",
          "criteria": {
            "goal": "The goal or desired outcome is unclear.",
            "context": "Missing background that the conversation does not supply: files, systems, names, numbers, definitions or why it is needed.",
            "specificity": "Missing concrete details, constraints, examples or the expected output format.",
            "success": "No way to tell when the task is done; no acceptance criteria.",
            "noise": "Rambling, contradictory or ambiguous wording.",
            "none": "No meaningful weakness; the prompt is already strong."
          }
        },
        "type": {
          "type": "choice",
          "instructions": "The state holds a short conversation summary and the prompt a user just sent to an AI assistant. Classify what kind of request the prompt is.",
          "criteria": {
            "task": "Asks the assistant to produce or change a deliverable: a document, code, plan, analysis, message, file.",
            "question": "Asks for information, an explanation or an opinion; the answer is the deliverable.",
            "creative": "Asks for creative output: copy, names, stories, designs, ideas with a style.",
            "exploratory": "Open-ended brainstorming, options or suggestions with no fixed deliverable."
          }
        }
      }
    }
  }]
}
```

**Failures.** If the call errors or times out, retry it once.
If it still fails, or the Composio connector or the `jev` toolkit is not connected, show one line in the user's language
and answer the prompt normally. Example: `JEV ⚠️ indisponível agora (conector Composio) — respondendo normalmente`.
Do not invent a grade.

## 3. Compute the result

Let `p` be `answers.quality.probabilities`.

- **Score** (0–10, one decimal) = 10·p(Excellent) + 7.5·p(Good) + 5·p(Average) + 2.5·p(Bad) + 0·p(Horrible).
- **Grade** = the class with the highest probability.
- **Confidence** = that highest probability, as a percentage. Do not use the API's `confidence` field. It can differ from the probability, and showing both confuses the user.
- **Near tie**: if the top two classes are 15 percentage points apart or less, show both. Put the more likely class first, as in `Ruim/Médio`. Use the icon of the first class.
- **Weakness** = the top choice of `answers.weakness`. Also show the second choice when its probability is ≥ 25%.
  If the top choice is `none`, show no weakness.
- **Type** = the top choice of `answers.type`.

## 4. Show the result

Show one short block in the user's language: the result line, then a tip line.

```
JEV 🟠 Ruim/Médio · 3,7/10 (53%) · ponto fraco: especificidade (+ contexto) · tipo: tarefa
💡 Da próxima vez, informe: o que você vende, números atuais e a meta.
```

Icons: 🟢 Excellent · 🔵 Good · 🟡 Average · 🟠 Bad · 🔴 Horrible.

**Tip rules**
- Write one line of at most about 15 words. Make it reusable and aimed at the user's next prompts, not only this one.
- Make it specific to this prompt's weakness and type. For example, for a question: "say what you'll use the answer for"; for a creative request: "give the audience and two examples of the tone you like".
- Do not repeat a tip already given in this session. Pick the next most useful one.
- Omit the tip for Excellent.

## 5. Act on the grade

| Grade | Mode on / full | Mode score-only |
|---|---|---|
| **Excellent** | Answer the original. | Answer the original. |
| **Good** | No rewrite. Answer the original, filling small gaps with sensible defaults that you state in one line. | Same. |
| **Average / Bad** | Rewrite (5a), then branch (5b). | Answer the original. |
| **Horrible** | Show nothing but the result line, then ask what the user wants in 1–2 questions. | Same. |

### 5a. Rewrite

- Keep the user's intent, voice (first person) and language.
- Use the conversation to fill in everything it already establishes.
- Fix the flagged weakness first and the secondary weakness second.
- Add what this **type** of request needs, and nothing more. For example, a question does not need a success criterion.
- **Never invent facts.** Mark what is unknown in `[colchetes]`, in a form the user can fill in.
- Show the rewrite under **Prompt reescrito** (in the user's language) as a block quote.

### 5b. Ask or answer?

Count the `[placeholders]` that only the user can fill: their numbers, their product, their audience, their files, their preferences.

- **None, or only ones you can safely assume:** answer the rewritten prompt. State your assumptions in one line.
- **One or more that change the answer materially:** do **not** write a full answer to a template. Instead:
  1. Ask 2–4 short, specific questions. Number them so the user can answer them in one line.
  2. Optionally add a **brief** provisional answer of at most about 8 lines, clearly labelled as generic, so the user gets something useful now. Use it when the topic is time-sensitive or the user seems to want momentum.
  3. When the user answers, treat the reply as the completion of this prompt. Skip grading it and deliver the full answer.

### 5c. Re-grade the rewrite (mode full)

In mode **full**, grade the rewrite with the same call and context. Put the rewrite in place of the prompt,
and leave the placeholders as they are. When the rewrite has `[placeholders]`, add this line to `state`
between the context and the prompt. Without it, JEV counts the blanks as missing information and caps the
score at about Good/Average:

```
Note: items in [brackets] are fields the user will fill in with their own data before sending; judge the prompt as if they were filled in.
```

Show the change on the result line, for example `JEV 🟠 3,7 → 🔵 8,1`.
If the rewrite does not reach at least Good, improve it once more before showing it.
Never do more than one extra round.

## 6. Things to avoid

- Do not grade your own messages. Do not grade the same user message twice.
- Do not let the grading crowd out the answer. Apart from the rewrite and the questions, JEV output stays within two lines.
- Do not lecture about prompt quality. The result line and the tip are enough.
- Do not change the user's request into something easier in the rewrite.
- Do not mention the skill's internals (formula, JSON, Composio) unless the user asks.

## 7. Session report

Keep a running list of the prompts graded this session: their grade, score and weakness.

- On `JEV resumo` / `JEV summary`, show a short report. Include the number graded, the average score, the trend (first half vs. second half), the most frequent weakness, and the one habit that would raise the user's scores most.
- Every 5th graded prompt, add one line under the result line, for example: `📈 média da sessão: 4,2 → 6,8 · ponto fraco mais comum: contexto`.
