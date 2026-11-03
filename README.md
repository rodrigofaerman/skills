# rodrigofaerman/skills

Claude plugins and skills by Rodrigo Faerman.

## jev-prompt-grader (Claude Code plugin)

Sends every prompt to **JEV** (TypeSafe AI) through the Composio MCP server (`JEV_EVALUATE_STATE`), grades it Excellent / Good / Average / Bad / Horrible, and — when it is not Excellent — rewrites it with the conversation as context and sends the rewritten version in its place. Shows a band above the prompt, the status line and a side pane where the interface draws them. Commands: `/jev`, `/jev improve`, `/jev history`, `/jev auto on|off`, `/jev hide|show`.

Works in Claude Code: terminal, desktop app, VS Code, and cloud sessions (in cloud sessions viewed from the Claude app, grading and rewriting run but the band/pane are not drawn; use `/jev history`).

**Requires:** an MCP server named exactly `Composio` with the `jev` toolkit connected. The hooks API is early access: keep Claude Code up to date.

Install, at the prompt of a terminal session:

```
/plugin install jev-prompt-grader --marketplace rodrigofaerman/skills
```

From a shell:

```bash
claude plugin install jev-prompt-grader --marketplace rodrigofaerman/skills
```

In the desktop app: click + next to the prompt box → Plugins → Add marketplace `rodrigofaerman/skills` → Add plugin.

For cloud sessions on a repository, add to that repository's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": { "rodrigofaerman-skills": { "source": { "source": "github", "repo": "rodrigofaerman/skills" } } },
  "enabledPlugins": { "jev-prompt-grader@rodrigofaerman-skills": true }
}
```

## jev-grader (skill for the Claude app: web, mobile, desktop chat)

`skills/jev-grader/SKILL.md`. Zip the `jev-grader` folder and upload it in claude.ai → Settings → Capabilities → Skills (remove the previous version first; both use the name `jev-grader`). Needs the Composio connector with the `jev` toolkit on your claude.ai account. It runs when asked ("grade this with JEV"); to make it near-automatic, add to Settings → Profile → personal preferences: *"Before answering, use the jev-grader skill; it decides which messages to grade."* A skill cannot intercept or replace a prompt before it is sent; it grades, shows the rewrite and answers it.

What it does (v2):

- **Grades in context.** It sends JEV a short summary of the conversation along with the prompt, so follow-ups are not penalized for references the conversation already resolves. It also classifies the request type (task, question, creative or exploratory) and judges the prompt against what that type needs.
- **Chooses which messages to grade.** It grades the first message of a task or topic. It skips follow-ups, confirmations, answers to its own questions, and prompts that contain sensitive data, which are never sent to JEV.
- **Shows a clear result.** The result line has the score, the most likely grade with its probability, near ties (for example `Bad/Average`) and a secondary weakness. It adds a one-line reusable tip.
- **Acts by grade.** Good gets no rewrite. Average and Bad are rewritten. When the rewrite needs facts only the user has, it asks 2–4 questions instead of answering a template. Horrible gets clarifying questions.
- **Modes.** `JEV on` (default), `JEV score` (grade and tip only), `JEV full` (also re-grades the rewrite and shows `3.6 → 7.6`), `JEV off`, `skip JEV` (current message only) and `JEV summary` (session report with trend and most common weakness).

## License

MIT
