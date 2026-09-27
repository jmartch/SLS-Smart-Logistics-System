---
name: sls-workflow-commits
description: Implement and verify changes in the Smart Logistics System repository, then create focused Git commits that follow the current contributor's established message style. Use when the user asks to complete an SLS task with its full workflow or explicitly asks to prepare or create commits.
---

# SLS Workflow and Commits

Complete requested SLS work through implementation, verification, and an optional commit while preserving repository rules and other contributors' changes.

## Authority and scope

- Read the repository `AGENTS.md` before acting and follow it as the project source of truth.
- Treat the user's current request as the limit of the work. Do not expand it to adjacent task-board items without permission.
- Inspect the worktree before editing. Preserve unrelated staged, modified, and untracked files.
- A request to implement or fix something does not authorize a commit. Create commits only when the user explicitly asks to commit, generate commits, or invokes this skill with an explicit commit instruction.
- Never push, amend, rebase, merge, tag, or rewrite history unless the user separately requests that operation.

## Working workflow

1. Inspect the relevant implementation, tests, documentation, repository status, and recent history before changing files.
2. Identify the smallest coherent change that satisfies the request and the applicable acceptance criteria.
3. Implement without overwriting unrelated work. If an existing user change overlaps the required edit, understand and preserve it; stop for direction only when safe integration is not possible.
4. Add or update behavior-focused tests when the change affects domain rules, tenant isolation, persistence, API contracts, asynchronous processing, or other testable behavior.
5. Run proportionate checks using Docker Compose exactly as required by `AGENTS.md`. Do not run project package managers, builds, linters, formatters, Prisma, or test runners directly on the host.
6. Review the final diff for scope, accidental formatting, generated artifacts, secrets, tenant isolation, and consistency with project architecture.
7. Report the implemented result and verification. If commits were authorized, create them using the commit workflow below.

Do not run the backend lint command during a read-only review because the configured script modifies files. Do not claim a check passed unless it actually ran successfully.

## Commit workflow

### Learn the contributor's style

Before proposing a message:

1. Read the configured Git author name and email.
2. Inspect recent non-merge commits authored by that identity. Prefer the last 20 to 30 relevant subjects.
3. If there is not enough author-specific history, inspect recent non-merge repository commits.
4. Infer the established language, type vocabulary, scope names, capitalization, and level of detail. Do not copy an old subject when it describes different behavior.

The current repository generally uses lowercase Conventional Commit subjects such as:

```text
feat(packages): implement package state lifecycle
test(packages): enforce lifecycle compatibility
chore(docker): use official postgis image
feat(assignments): integrate validation chain with prisma reservation
```

Treat these as examples, not a fixed list. Prefer observed current conventions when the history evolves.

### Form commits

- Make each commit one coherent, reviewable change.
- Use the observed Conventional Commit form: `type(scope): imperative summary`, or `type: imperative summary` when repository history shows that no scope is clearer.
- Choose the type from the actual purpose, commonly `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, or `build`.
- Choose a domain-oriented scope already used by the repository when it accurately describes the change, such as `packages`, `assignments`, `route-planning`, `database`, `api`, or `docker`.
- Keep the subject concise, lowercase, imperative, and free of a trailing period unless the contributor's current history establishes another style.
- Split implementation, contract tests, infrastructure, and documentation only when they are independently meaningful and the user's existing history supports that separation. Do not manufacture extra commits merely to increase their number.
- Never include unrelated files in a commit. Stage explicit paths, then inspect the staged diff and staged file list before committing.
- Do not stage secrets, local environment files, build output, dependency directories, or generated artifacts excluded by repository policy.

### Commit gate

Immediately before each commit:

1. Confirm that explicit commit authorization exists in the current request.
2. Confirm the staged paths belong only to the requested change.
3. Review the staged diff.
4. Confirm relevant verification results and disclose any check that could not be run.
5. Create the commit with the selected message.
6. Inspect the resulting commit summary and remaining worktree status.

If verification fails, do not represent the work as complete. Fix failures within scope when possible. If a failure is unrelated or blocked by infrastructure, explain it and ask before committing unless the user explicitly authorized committing despite that known failure.

## Completion report

State:

- what changed;
- which checks passed, failed, or were not run;
- each created commit hash and subject, when applicable;
- any remaining unrelated worktree changes that were intentionally left untouched.
