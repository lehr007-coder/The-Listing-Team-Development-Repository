# CLAUDE.md — The Listing Team Development Repository

## Project Overview

This is the development repository for **The Listing Team**. The project is in its early stages — no application framework, build tooling, or source code has been established yet.

## Repository Structure

```
The-Listing-Team-Development-Repository/
├── CLAUDE.md          # AI assistant guidance (this file)
├── README.md          # Project description
└── .git/              # Git metadata
```

> **Note:** This file should be updated as the project grows. When new frameworks, tooling, or conventions are introduced, reflect them here.

## Current State

- **Status:** Initial setup — no source code, dependencies, or configuration present
- **Primary branch:** `main`
- **Repository owner:** lehr007-coder

## Development Guidelines

### Git Workflow

- Use feature branches for all changes
- Write clear, descriptive commit messages
- Push changes to remote feature branches before merging
- Keep `main` in a deployable state

### Branch Naming

- Feature branches: `feature/<short-description>`
- Bug fixes: `fix/<short-description>`
- Documentation: `docs/<short-description>`

### Code Quality (to be configured)

As the project evolves, the following should be established and documented here:

- [ ] Linter configuration (ESLint, Pylint, etc.)
- [ ] Code formatter (Prettier, Black, etc.)
- [ ] Testing framework and conventions
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Environment variable management (.env.example)
- [ ] Dependency management (package.json, requirements.txt, etc.)
- [ ] .gitignore rules

## For AI Assistants

- **Read this file first** before making changes to the repository
- Do not assume a tech stack — check what exists before adding dependencies
- When establishing new tooling or frameworks, update this file accordingly
- Prefer minimal, well-structured changes over large boilerplate dumps
- Ask the user before making major architectural decisions (framework choice, database selection, etc.)
- Keep documentation in sync with actual project state
