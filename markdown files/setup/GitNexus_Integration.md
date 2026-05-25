# GitNexus Integration

How GitNexus code intelligence is wired into this project and how to use it with Claude.

---

## What GitNexus Does

GitNexus indexes the codebase into a graph of symbols, relationships, and execution flows. It gives Claude a queryable map of the code so that instead of grepping files, you can ask "what calls this function?" or "what breaks if I change this?"

This project is indexed as **Dev-Todo-List-App**.

---

## Index Stats (last updated)

- **Symbols:** ~217
- **Relationships:** ~368
- **Execution flows:** ~20

Run `npx gitnexus analyze` to refresh the index after significant changes.

---

## When to Run `analyze`

Run it when:
- You've added or renamed functions
- You've restructured the IPC handlers
- You've added new state variables or rendering functions
- Claude warns that the index is stale

```bash
npx gitnexus analyze
```

---

## Key MCP Tools

| Tool | When to use |
|------|-------------|
| `gitnexus_query` | Exploring unfamiliar code — finds execution flows by concept |
| `gitnexus_impact` | Before editing a function — shows blast radius (callers, risk) |
| `gitnexus_context` | Full detail on one symbol — callers, callees, flows it's in |
| `gitnexus_detect_changes` | Before committing — verify only expected symbols changed |
| `gitnexus_rename` | Renaming functions/vars — updates all call sites safely |

---

## Rules (from CLAUDE.md)

1. **Always run impact analysis before editing any symbol.** Ask Claude to run `gitnexus_impact` first.
2. **Always run `gitnexus_detect_changes` before committing** to check scope.
3. **Never rename with find-and-replace** — use `gitnexus_rename`.
4. **Warn if HIGH or CRITICAL risk** — don't proceed without user confirmation.

---

## Example Prompts for Claude

```
Before we edit attachTodoHandlers, run impact analysis on it.
```

```
Use gitnexus to find all the places that call renderTodos.
```

```
Run detect_changes before we commit — make sure only the step handlers changed.
```

---

## GitNexus Resources

| Resource URI | Contents |
|--------------|---------|
| `gitnexus://repo/Dev-Todo-List-App/context` | Codebase overview, index freshness |
| `gitnexus://repo/Dev-Todo-List-App/clusters` | All functional areas |
| `gitnexus://repo/Dev-Todo-List-App/processes` | All execution flows |
| `gitnexus://repo/Dev-Todo-List-App/process/{name}` | Step-by-step execution trace |

---

## Skill Files

Detailed guides for each GitNexus use case live in `.claude/skills/gitnexus/`:

| Task | Skill file |
|------|-----------|
| Exploring architecture | `gitnexus-exploring/SKILL.md` |
| Blast radius analysis | `gitnexus-impact-analysis/SKILL.md` |
| Tracing bugs | `gitnexus-debugging/SKILL.md` |
| Refactoring safely | `gitnexus-refactoring/SKILL.md` |
| Tools and schema reference | `gitnexus-guide/SKILL.md` |
| CLI commands | `gitnexus-cli/SKILL.md` |
