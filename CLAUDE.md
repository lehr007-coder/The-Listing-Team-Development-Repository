# CLAUDE.md — The Listing Team Development Repository

## Project Overview

This is the central development repository for **The Listing Team**. The project is in early-stage initialization — no application framework, build tooling, or source code has been established yet.

- **Repository:** `lehr007-coder/the-listing-team-development-repository`
- **Primary branch:** `main`
- **Status:** Initial setup — structure will expand as the project develops

## Repository Structure

```
The-Listing-Team-Development-Repository/
├── CLAUDE.md          # AI assistant guidance (this file)
├── README.md          # Project description
└── .git/              # Git metadata
```

> **Note:** Update this file as the project grows. When new frameworks, tooling, or conventions are introduced, reflect them here.

## Development Workflow

### Branch Naming

| Prefix      | Purpose                        |
|-------------|--------------------------------|
| `feature/`  | New features                   |
| `fix/`      | Bug fixes                      |
| `docs/`     | Documentation changes          |
| `claude/`   | AI-assisted task branches      |

### Git Practices

- **Default branch:** `main` — keep it in a deployable state at all times
- **Commit messages:** Imperative mood, clear and descriptive (e.g., "Add user authentication", "Fix sidebar layout issue")
- **Push command:** `git push -u origin <branch-name>`
- **Network retries:** On push/fetch failure, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s)
- **Commits are signed** via SSH

### Pull Requests

- Target `main` unless otherwise specified
- Include a summary of changes and a test plan
- Do not create PRs unless explicitly requested

## Key Conventions

### Code Style

- Follow established linting and formatting rules once configured
- Prefer readability and simplicity over cleverness
- Keep functions small and focused

### File Organization

- Group related files by feature or domain
- Keep configuration files at the project root
- Place documentation in the root or a `docs/` directory

### Security

- Never commit secrets, API keys, or credentials
- Use `.env` files for environment-specific configuration (and add `.env` to `.gitignore`)
- Validate all user input at system boundaries

## Project Setup Checklist

As the project evolves, the following should be established and documented here:

- [ ] Tech stack / framework selection
- [ ] Dependency management (package.json, requirements.txt, etc.)
- [ ] Linter configuration (ESLint, Pylint, etc.)
- [ ] Code formatter (Prettier, Black, etc.)
- [ ] Testing framework and conventions
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Environment variable management (.env.example)
- [ ] .gitignore rules

## AI Assistant Guidelines

1. **Read this file first** before making changes to the repository
2. **Read before writing** — always read existing files before modifying them
3. **Do not assume a tech stack** — check what exists before adding dependencies
4. **Minimal changes** — only change what is necessary to complete the task
5. **No speculative additions** — do not add error handling, validation, comments, or abstractions beyond what is needed
6. **Respect existing patterns** — follow conventions already established in the codebase
7. **Commit only when asked** — do not create commits unless the user explicitly requests it
8. **Never push to main** — always work on feature branches unless directed otherwise
9. **Ask before major decisions** — framework choice, database selection, or architectural changes require user input
10. **Keep docs in sync** — when establishing new tooling or frameworks, update this file accordingly
