# jev-prompt-grader

A Claude Code mod that sends every prompt to **JEV** (TypeSafe AI, via the Composio MCP server, tool `JEV_EVALUATE_STATE`, model `jev-latest`) and grades its quality as Excellent, Good, Average, Bad or Horrible, plus its biggest weakness (goal, context, specificity, success criteria, noise).

**Auto-rewrite (on by default):** when a prompt grades below Excellent (and has 6+ words), the mod rewrites it with the conversation as context (`$.model.fork`) and sends the rewritten version in place of the original. A notice in the conversation shows the grade before → after, the text that was sent and your original. `/jev auto off` turns it off.

Commands: `/jev` (side pane), `/jev improve` (rewrite the last prompt into the prompt box), `/jev history`, `/jev auto on|off`, `/jev hide|show` (band above the prompt). Requires the "Composio" MCP server with the jev toolkit connected.
