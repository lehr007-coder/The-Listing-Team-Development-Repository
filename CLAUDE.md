# CLAUDE.md - AI Assistant Guide

## Repository Overview

**The Listing Team | Development Repository**

This is the central development repository for The Listing Team. It is in early-stage initialization and serves as the foundation for the team's development work.

- **Primary branch:** `main`
- **Hosting:** GitHub (`lehr007-coder/the-listing-team-development-repository`)

## Repository Structure

```
/
├── README.md          # Project overview
├── CLAUDE.md          # This file - AI assistant guide
└── .git/              # Git metadata
```

> This repository is newly initialized. Structure will expand as the project develops.

## Development Workflow

### Branch Naming Conventions

- Feature branches: `feature/<short-description>`
- Bug fixes: `fix/<short-description>`
- Claude AI branches: `claude/<task-description>-<id>`

### Git Practices

- **Default branch:** `main`
- **Commit messages:** Use clear, descriptive messages in imperative mood (e.g., "Add user authentication", "Fix sidebar layout issue")
- **Commits are signed** via SSH
- Push with: `git push -u origin <branch-name>`
- If push fails due to network errors, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s)

### Pull Requests

- PRs should target `main` unless otherwise specified
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
- Use `.env` files for environment-specific configuration (add to `.gitignore`)
- Validate all user input at system boundaries

## AI Assistant Guidelines

When working in this repository:

1. **Read before writing** - Always read existing files before modifying them
2. **Minimal changes** - Only change what is necessary to complete the task
3. **No unnecessary additions** - Do not add comments, docstrings, or type annotations to unchanged code
4. **No speculative features** - Do not add error handling, validation, or abstractions beyond what is needed
5. **Respect existing patterns** - Follow the conventions already established in the codebase
6. **Commit only when asked** - Do not create commits unless the user explicitly requests it
7. **Never push to main** - Always work on feature branches unless directed otherwise
8. **Test your changes** - Run any available tests before considering work complete
