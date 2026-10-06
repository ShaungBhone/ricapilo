# Recap

An open-source Burmese AI recap workspace: Laravel 13 API, Next.js 16 frontend, and an isolated FFmpeg video renderer. Uses Bun, Docker Compose, Laravel Boost, and shadcn preset `b7Br6guwa` with the `login-03` and `sidebar-07` blocks.

## Start with Docker

Install Docker with Compose and start the Docker daemon. From this directory:

```sh
sh scripts/setup.sh
docker compose up --build -d
```

The setup script generates a private `.env` containing a unique application key, database password, and renderer token. It retains an existing `.env`. Do not replace APP_KEY after storing encrypted user credentials.

- App: http://localhost:3000
- Development email inbox: http://localhost:8025

Register an account in the app. Open its verification email in Mailpit and follow the link in the same browser where you registered. Add your OpenRouter API key in Settings. Create an assistant with a text model, transcription model, speech model, and a supported voice ID. The model catalog is discovered dynamically; there are no hardcoded voice names.

The local mail inbox is for development. Configure a real SMTP service for deployment.

## Configure discovery

Dailymotion discovery uses its public video API. YouTube requires a YouTube Data API key managed by the administrator. Create and verify an account, then promote it:

```sh
docker compose exec api php artisan recap:admin you@example.com
```

Open Administration and save the YouTube key. Administrators can also disable individual model IDs. User-supplied API keys are encrypted and never returned by the API. Each user's assistants, projects, files, and conversation history are private.

## Workflow

1. Type a prompt on Home, or record a voice prompt using a configured assistant.
2. Search YouTube, Dailymotion, or both. The assistant can translate Burmese requests into concise search queries.
3. Select a result to create a project, or create a project with an upload or transcript.
4. Generate the Burmese script, review it, and save changes.
5. Generate narration, choose a caption style, and render a vertical or landscape video.
6. Preview and download the text script, MP3, and MP4.

Each paid generation is explicitly started by the user. Search, generation, and login requests are throttled. Output text and audio quality depends on the selected models. Test the short voice preview with Burmese before generating a long project.

## Source access and generation behavior

Search results are metadata, not media access guarantees. Selection records only a supported platform and video ID. The worker attempts to retrieve available media using yt-dlp, then FFmpeg extracts audio in four-minute chunks. If a platform blocks retrieval, the project reports that failure and accepts an upload or transcript. The app never fabricates a transcript from a title.

The initial video assembly uses available source footage with Burmese narration and burned-in captions. A transcript-only or audio-only project produces a simple caption video. It does not include a timeline editor. Two basic caption styles are included: clean bottom and boxed minimal.

Caption timing is currently estimated from each narration paragraph's measured duration. It is not word-level alignment. The Remotion caption preview is a visual timing preview; the rendered MP4 is the authoritative video with source footage and narration.

Browser Talk uses microphone recording, silence detection, per-turn OpenRouter transcription/chat/speech calls, persisted transcript, and audio playback. It is a turn-based live conversation, not a provider-native full-duplex realtime socket. Chrome and Firefox support the implemented WebM/Ogg recording path; HTTPS or localhost is required. Headphones improve echo cancellation. Stop controls cancel local playback and suppress stale responses; an upstream request already submitted may still be billed.

## Services

- `frontend`: Next.js standalone application, exposes localhost:3000.
- `api`: Laravel on Apache; reachable only inside the Compose network.
- `worker`: long-running database queue worker with a 30-minute job timeout.
- `renderer`: authenticated internal Node/FFmpeg renderer, shares only project media storage.
- `database`: PostgreSQL, persistent volume.
- `redis`: cache and overlap locks.
- `mailpit`: development SMTP inbox.
- `init`: applies migrations before API and worker start.

The renderer has one concurrent rendering slot. A second render is rejected with a retryable project failure rather than running unbounded CPU jobs. The worker runs with one process by default. Queue retry visibility is longer than the job timeout to prevent duplicate processing.

## Local development without Docker

Requirements: PHP 8.3+, Composer 2, Node.js 24, Bun 1.3.13. Media jobs additionally need yt-dlp, FFmpeg, and ffprobe.

```sh
cd api
composer install
cp .env.example .env
php artisan key:generate
php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8000
```

In another terminal:

```sh
cd frontend
bun install --frozen-lockfile
cp .env.example .env.local
bun run dev
```

Set API_INTERNAL_URL in `frontend/.env.local` to the API URL. The frontend proxies requests through `/api/backend`; authentication uses HTTP-only Laravel session cookies and CSRF tokens. AI calls and credentials stay on Laravel.

For local media jobs, run `php artisan queue:work --timeout=1800 --tries=1`. The renderer requires a matching RENDERER_TOKEN and shared MEDIA_ROOT; Docker is the supported complete setup.

Laravel Boost is installed as a development dependency. Use its generated guidelines in `api/AGENTS.md`. Unused Laravel Vite assets, welcome page, frontend package files, and demo tests have been removed.

## Checks

```sh
cd api
composer validate --no-check-publish
php artisan test
vendor/bin/pint --test
cd ../frontend
bun run typecheck
bun run lint
bun run build
cd ../renderer
node --test
```

API tests mock provider responses and prevent stray requests, so they do not use paid API credits. The full live OpenRouter workflow requires your own key and credits. GitHub Actions runs API, frontend, and caption-format checks.

## Deployment and backups

Compose is configured for local use: localhost ports, local development mail, and APP_ENV=local. Before deployment, set the external HTTPS FRONTEND_URL and matching APP_URL, configure real SMTP, set APP_ENV=production and secure session cookies, and place the frontend behind TLS. Next.js embeds API_INTERNAL_URL in its rewrites at build time; rebuild when changing that address.

Back up PostgreSQL, the media volume, and APP_KEY securely together. The renderer token and database credentials must remain private. API and renderer ports should stay internal. Keep provider models and media tools updated. Configure per-user quotas and additional workers based on your deployment's capacity.

## Open-source scope

This repository contains the open-source application only. No premium code, billing, editor scaffolding, or feature gates are included. See LICENSE, CONTRIBUTING.md, SECURITY.md, and THIRD_PARTY.md. A public GitHub destination has not been configured.
