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

### 3. Integration Policy
- **Rebase over Merge**: All feature branches must be rebased onto `develop` before merging to maintain linear history.
- **Squash and Merge**: Final merge into `main` must be squashed into a single atomic commit.