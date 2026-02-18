## Git Workflow Policy

### 1. Branching Strategy
- `main`: Protected. No direct commits. Only Merge Requests (MR) from `release/` or `hotfix/`.
- `develop`: Integration branch. All features must be merged here.
- `feature/`: Format: `feature/<ISSUE-ID>-<short-description>`.
- `hotfix/`: Format: `hotfix/<ISSUE-ID>-<short-description>`.

---

### 2. Commit Message Standard (Conventional Commits)
<тип>(<область>): <описание>

- All text must be in English.
- Use imperative mood ("add", not "added").
- Scope is mandatory for `feat` and `fix`.
- Breaking Changes must be marked with `!` after the type: `feat(api)!: remove deprecated endpoint`.


### Types
- `feat` — new functionality
- `fix` — fixing the bug
- `docs` — documentation
- `style` — formatting (no code change)
- `refactor` — refactoring
- `test` — tests
- `chore` — maintenance (dependencies, assembly)
- `perf` — performance improvement
- `ci` — CI/CD setup

---

## Integration Policy

### 1. Linear History Standard
**Rebase over Merge**: All feature branches must be kept up-to-date with `main` using `git rebase main`. Merge commits in PRs are strictly prohibited. This ensures a clean, readable, and navigable project history where every commit is functional and sequential.

### 2. Atomic Squash
**Squash and Merge**: All PRs must be squashed into a single, high-quality atomic commit upon merging into `main`. The final squash commit message must strictly follow the Conventional Commits format (e.g., `feat(ui): add navbar`). 

### 3. Cleanup
**Branch Deletion**: Feature branches must be deleted immediately after a successful merge to keep the repository clean.