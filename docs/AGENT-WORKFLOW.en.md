# Bosun collaboration workflow

How humans and agents work together on a Bosun task. This file is the single source of the rules:
the MCP resource `bosun://workflow` and `GET /api/v1/workflow.md?lang=en` return it verbatim.
Other repositories reference it from their `CLAUDE.md` (`@~/workspace/bosun/docs/AGENT-WORKFLOW.md`)
or read the MCP resource.

## 1. Roles

Three roles per task; each can be a human or an agent:

| Role | Field | Who |
|---|---|---|
| requester | `created_by` | whoever created the task - often a user, often an upstream project's agent |
| assignee | `assignee` | whoever moved it to IN_PROGRESS (claimed it), or was pre-assigned at creation |
| verifier | actor of the `-> VERIFIED` history entry | the requester, a downstream agent, or the assignee itself when allowed |

One project may have several worktrees and several agents running at once, so identity is per **session**, not per project.

## 2. Identity

Call once at the start of a session:

```
identify(name="keel/feature-search", kind="agent", project="KEEL", worktree="/home/x/keel-search")
```

- `name` convention: `<project key>/<worktree or purpose>`. Different worktrees of the same project must use different names.
- Every later write (create, transition, feedback) is recorded under that name. Without `identify` you get an auto name like `agent-1a2b3c`, which nobody can read.
- Humans set their name in the top-right of the web UI; it lands in the same actor table. `list_actors` / `GET /api/v1/actors` lists every identity seen and its kind.
- `actor` / `author` on a single call overrides the session identity; normally unnecessary.

## 3. Statuses and transitions

```
NEW ──→ IN_PROGRESS ──→ DONE ──→ VERIFIED
 ↑ │        │  ↑          │          │
 │ │        │  └──────────┘ (send back) │
 │ │        │  ←─────────────────────┘ (reopen)
 │ │        ├──→ REJECTED ──→ NEW   (requirement is wrong: refuse, resubmit after revising)
 │ └────────┴──→ CANCELLED ─→ NEW   (no longer needed: cancel, restore if needed again)
```

| From | To | Who | Meaning |
|---|---|---|---|
| NEW | IN_PROGRESS | assignee | claim; `assignee` is set to the current actor (send-back / reopen keep it) |
| IN_PROGRESS | DONE | assignee | finished, waiting for verification; attach `commits` and `tests` |
| DONE | VERIFIED | verifier | accepted; terminal |
| DONE | IN_PROGRESS | verifier | sent back; add a `review` feedback first |
| VERIFIED | IN_PROGRESS | anyone | reopen |
| NEW / IN_PROGRESS | REJECTED | assignee | requirement is wrong or impossible; add a `review` feedback first |
| REJECTED | NEW | requester | requirement revised, resubmitted |
| NEW / IN_PROGRESS | CANCELLED | requester (or anyone) | not going to be done: obsolete or no longer needed - **not** a rejection; add a `comment` feedback saying why |
| CANCELLED | NEW | anyone | restore: needed again |

Closed states: VERIFIED, REJECTED, CANCELLED. DONE / VERIFIED cannot be cancelled - finished work is reopened instead.

## 4. What to do at each step

1. **Read** `get_task(id)`: title, body, history and feedback. If there is an unanswered `question`, do not start.
2. **Claim** `transition_task(id, "IN_PROGRESS")`. If the requirement is wrong or impossible: `add_feedback(kind="review")` explaining why, then `transition_task(id, "REJECTED")`.
3. **Blocked** on a decision from the requester: `add_feedback(kind="question")` and **stop**; do not mark DONE. The requester replies with `kind="answer"`.
4. **Finish**
   1. Run the tests.
   2. `add_feedback(kind="comment")`: what was done, which files changed, commit hashes, test results.
   3. `transition_task(id, "DONE", commits=["579cb02", ...], tests={command: "rebar3 eunit && rebar3 ct", passed: true, summary: "28 eunit + 4 ct"})`.
      - `commits` are git commit hashes (7-64 hex chars). If there were none, pass `[]` and say why in the feedback.
      - `tests` has `command` (what was run), `passed` (required boolean), `summary` (one line).
      - Both are stored in the status history; the task's `commits` field aggregates every hash in the history.
5. **Verify** `transition_task(id, "VERIFIED")`, or add a `review` feedback and send it back to IN_PROGRESS.
   - The requester or a downstream agent may verify without test evidence (they checked it themselves).
   - **The assignee may verify its own task only with passing tests**: `tests.passed=true` on this call, or on the most recent `-> DONE` entry. Otherwise the backend rejects it with `self_verify_requires_tests`.
6. **Not doing it** because the requirement is obsolete or superseded by another task: `add_feedback(kind="comment")` with one line on why, then `transition_task(id, "CANCELLED")`. This differs from REJECTED - REJECTED is the assignee saying the requirement is wrong; CANCELLED is anyone saying it is no longer needed. Cancelling mid-work keeps `assignee`. If it is needed again, `transition_task(id, "NEW")` restores it.

## 4b. Epics

When a goal splits into several steps, create an epic first (`create_task(kind="epic")`) and attach the step tasks with `epic="KEY-N"` (at creation, or via `update_task(epic=...)`). An epic has its own status and feedback: once every step is verified, the requester moves the epic to VERIFIED. `get_task` on an epic returns `children` (its steps) and `progress` (verified / total); `list_tasks(epic="KEY-N")` or BQL `epic = KEY-N` lists the steps. Steps may live in other projects.

## 4c. Links: dependencies and replacements

- **Dependency** `link_tasks(from=A, to=B, type="depends_on")`: A cannot start until B is DONE or VERIFIED (`transition_task(A, "IN_PROGRESS")` is rejected and the error lists the blockers). When `get_task` shows `blocked: true`, read `links` first. Cycles are rejected.
- **Replacement** `link_tasks(from=A, to=B, type="replaces")`: A takes over B. If B is still NEW / IN_PROGRESS it is cancelled automatically with `replaced by A` in its history - so "same need, different approach" is a new task plus a replaces link, not a manual cancel.
- Links can be removed (`unlink_tasks`); removing never changes a status. BQL: `blocked = true`, `depends_on = KEY-N`, `blocks = KEY-N`, `replaces = KEY-N`, `replaced_by = KEY-N`.

## 5. Feedback

Four kinds:

| kind | use |
|---|---|
| `comment` | general note; the completion report |
| `review` | verification notes: send-back, rejection, acceptance remarks |
| `question` | needs a decision from the other party; stop after asking |
| `answer` | reply to a question |

Feedback is **immutable and never deleted**. To correct your own entry use `update_feedback(feedback_id, content)`: it appends a revised copy and marks the old one superseded (`superseded_by`). Only the original author can revise. Feedback ids look like `KEY-12#3`.

## 6. Cross-project example: coxswain asks keel for a feature

```
coxswain/main   identify("coxswain/main", kind="agent", project="COX")
coxswain/main   create_task(project="KEEL", title="Prefix matching in search API", description="...")   -> KEEL-7
keel/search     identify("keel/search", kind="agent", project="KEEL", worktree="feature/search")
keel/search     get_task("KEEL-7")
keel/search     transition_task("KEEL-7", "IN_PROGRESS")                                  assignee = keel/search
keel/search     add_feedback("KEEL-7", kind="question", "Minimum prefix length?")
coxswain/main   add_feedback("KEEL-7", kind="answer", "2 characters")
keel/search     ... implement, run tests ...
keel/search     add_feedback("KEEL-7", kind="comment", "Implemented in a1b2c3d; eunit 12/12")
keel/search     transition_task("KEEL-7", "DONE", commits=["a1b2c3d"], tests={command:"rebar3 eunit", passed:true, summary:"12/12"})
coxswain/main   transition_task("KEEL-7", "VERIFIED")
```

If coxswain does not verify and keel closes it out itself, the last line becomes `keel/search transition_task("KEEL-7", "VERIFIED")` - allowed because the DONE entry already carries passing tests.

## 7. How to reference this

- In another repository's `CLAUDE.md`: `@~/workspace/bosun/docs/AGENT-WORKFLOW.md`, plus one line such as "this project's tasks live in Bosun project `KEEL`; identify as `keel/<worktree>`".
- MCP: resource `bosun://workflow`; the prompt `/bosun:work_on_task KEEL-7` loads the task and these rules into context.
- REST: `GET /api/v1/workflow.md` (Chinese), `GET /api/v1/workflow.md?lang=en` (English).
- Design details: `designs/03-task-status.md`, `designs/04-feedback.md`, `designs/11-identity.md`.
