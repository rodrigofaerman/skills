---
name: jev-grader
description: Grade the user's prompt with JEV (TypeSafe AI, via the Composio connector, tool JEV_EVALUATE_STATE) as Excellent, Good, Average, Bad or Horrible, and when it is not Excellent rewrite it and answer the rewritten version. Use whenever the user asks to grade, evaluate, score or improve a prompt, mentions JEV, or when their preferences ask for every request of 6+ words to be graded first.
---

# JEV prompt grader

Grade the user's latest message (the "prompt") with JEV before working on it.
This is the chat counterpart of the `jev-prompt-grader` Claude Code plugin: here nothing
intercepts the prompt, so you grade it, show the result, and then answer the improved version.

## When to skip
- Messages under 6 words, plain confirmations ("yes", "ok", "continue"), or answers to a question you just asked.
- The user said "skip JEV" / "no JEV" for this message.

## 1. Grade with JEV

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
      "state": "<the user's prompt, verbatim>",
      "questions": {
        "quality": {
          "type": "choice",
          "instructions": "The state is a prompt a user sent to an AI assistant. Judge the prompt's quality as an instruction: clarity of goal, context, specificity, success criteria, concision. Do not answer the prompt.",
          "criteria": {
            "Excellent": "Clear goal, rich context, specific constraints and output format, explicit success criteria; nothing ambiguous.",
            "Good": "Clear goal and enough context; minor gaps the assistant can fill sensibly.",
            "Average": "Goal understandable but missing important context, constraints or success criteria.",
            "Bad": "Vague or ambiguous; the assistant must guess most of what is wanted.",
            "Horrible": "Incomprehensible, contradictory, empty or no actionable request."
          }
        },
        "weakness": {
          "type": "choice",
          "instructions": "The state is a prompt sent to an AI assistant. Pick the single biggest weakness of the prompt.",
          "criteria": {
            "goal": "The goal or desired outcome is unclear.",
            "context": "Missing background: files, systems, names, definitions or why it is needed.",
            "specificity": "Missing concrete details, constraints, examples or the expected output format.",
            "success": "No way to tell when the task is done; no acceptance criteria.",
            "noise": "Rambling, contradictory or ambiguous wording.",
            "none": "No meaningful weakness; the prompt is already strong."
          }
        }
      }
    }
  }]
}
```

If the Composio connector or the `jev` toolkit is not connected, say so in one line and answer the prompt normally.

## 2. Score

From `answers.quality.probabilities`, score = 10·P(Excellent) + 7.5·P(Good) + 5·P(Average) + 2.5·P(Bad) + 0·P(Horrible), one decimal.

## 3. Show the result (one short block, in the user's language)

```
JEV 🟡 Average · 4.9/10 (confidence 86%) · weakness: lacks specificity
```
Icons: 🟢 Excellent · 🔵 Good · 🟡 Average · 🟠 Bad · 🔴 Horrible.

## 4. If not Excellent: rewrite, then answer the rewrite

- Rewrite the prompt using the conversation as context: keep the user's intent, voice (first person) and language;
  fix the flagged weakness; add goal, relevant context, specifics, output format and success criteria.
  Do not invent facts; state unknowns as assumptions or questions.
- Show it under **Rewritten prompt**, then answer that rewritten prompt.
- If it is Excellent, just answer the original.
