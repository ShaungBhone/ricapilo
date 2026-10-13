# Contributing to Ricapilo

Thanks for your interest in improving Ricapilo. This guide covers how to propose changes, set up the project, and get a pull request merged.

## Before you start

- Check the [Roadmap](README.md#roadmap) and open issues to see what is planned.
- For anything larger than a small fix, open an issue first and describe the problem and your proposed approach. This avoids duplicate work and changes that do not fit the project.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## Project layout

- `api/`: Laravel API, queue jobs, and AI provider integration.
- `frontend/`: Next.js app (shadcn/ui, Tailwind CSS).
- `renderer/`: internal Node/Remotion video renderer.
- `docker/`, `compose.yaml`: Docker images and the full local stack.

## Set up

Docker is the supported complete setup:

```sh
sh scripts/setup.sh
docker compose up --build -d
```

For live frontend reloads, use the development override:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build frontend
```

To work on the API or frontend without Docker, follow [Local development without Docker](README.md#local-development-without-docker). You need PHP 8.3+, Composer 2, Node.js 24, and Bun 1.3.13.

You do not need paid API keys to run the test suites. Tests mock provider responses. To try the full workflow manually, set your own `OPENROUTER_API_KEY` (and optionally `YOUTUBE_API_KEY`) in `.env`.

## Make changes

1. Fork the repository and create a branch from `main` (for example `fix/caption-timing` or `feat/new-caption-style`).
2. Keep each pull request focused on one change.
3. Follow the existing style and conventions of the code around your change. Formatting is enforced by Pint, Rector, ESLint, and Prettier.
4. Add or update tests for behavior changes. API changes need PHPUnit tests in `api/tests/Feature` or `api/tests/Unit`.
5. Update `README.md` when you change setup steps, configuration, or user-facing behavior.

## Run the checks

Run the checks for every part you changed before opening a pull request. CI runs the same checks.

```sh
# API (install frontend dependencies first; API lint uses Prettier from frontend/)
cd frontend && bun install --frozen-lockfile && cd ..
cd api
composer lint        # or composer lint:fix, then re-run composer lint
composer test

# Frontend
cd frontend
bun run typecheck
bun run lint
bun run build

# Renderer
cd renderer
bun install --frozen-lockfile
bun run build
node --test
```

## Commit messages

Write short, imperative subjects that describe the change, for example `Add boxed caption style` or `Fix duplicate render on retry`. Use the body to explain why when it is not obvious.

## Pull requests

- Describe what changed and why, and link the related issue.
- Add screenshots or a short recording for UI changes.
- Make sure all checks pass.
- Be ready to respond to review feedback. A maintainer will merge the pull request after approval.

## Guidelines

- Never commit secrets, `.env` files, API keys, or generated media.
- Keep provider API keys on the server. They must never reach the frontend or API responses.
- Respect platform terms when working on media retrieval and discovery.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
