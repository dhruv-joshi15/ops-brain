# Ops Brain

Ops Brain is a local operations workspace built for the Just Sortd Product Engineer take-home assessment. It turns meeting notes into tasks a reviewer can approve, then shows how deadlines, dependencies, and goal health change when work slips.

## Run locally

Use Node.js 22.18+ and npm.

```bash
git clone https://github.com/dhruv-joshi15/ops-brain.git
cd ops-brain
npm ci
npm run setup
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Setup generates the Prisma client and initializes SQLite. The default database is `ops.db` in the project directory. Local edits persist across restarts. No credentials are required for the synthetic sample.

## Walk through the sample

1. Open **Meetings → Load synthetic sample → Extract tasks**. The November 19, 2026 meeting uses English, Hindi, and Gujarati.
2. Review four proposals with owners, dates, source evidence, and prerequisite links. Edit the proposals, choose approval decisions, then select **Commit review**. Reprocessing the same meeting opens the existing review.
3. Open **Dependencies** and set the design task’s projected completion to December 3. The simulator forecasts frontend work finishing December 13, QA on December 18, and campaign assets on December 23. The campaign forecast puts the December 20 launch goal **Off Track**. Compare the saved and simulated goal status and priorities, then clear the scenario.
4. Open **Activity** to inspect extraction inputs, outputs, review decisions, cost estimates, and draft Slack follow-ups. For another pass, use **Settings → Reset sample demo** and confirm. The reset removes the synthetic run and its committed tasks while preserving unrelated workspace records.

The sample assumes a November 19, 2026 workspace date. Set `OPS_DEMO_DATE=2026-11-19` in `.env.local` for a reproducible recording on a different day. The [four-minute demo script](DEMO_SCRIPT.md) covers the current interface.

## What’s included

| Area | Capabilities |
| --- | --- |
| Dashboard | Goal health, pending reviews, blocked work, upcoming deadlines, and explainable priorities from saved workspace data |
| Meeting review | Structured proposals, evidence, editable fields, human approval, dependency validation, and duplicate prevention |
| Tasks | Search, filters, creation, editing, manual priority overrides, archive and restore, and deletion with dependency reassignment or unlinking |
| Goals and team | Create and edit goals, archive and restore, manage team members, and transfer or unassign linked work before removal |
| Dependencies | Interactive graph and hypothetical forecasts with downstream impact and draft Slack follow-ups |
| Activity and settings | Searchable extraction and change history, scoped demo cleanup, versioned extraction and ranking rules, and Midnight and Light themes |

## Extraction modes

- **Synthetic sample.** Deterministic local extraction for the built-in meeting. Pasted custom notes require a configured provider.
- **Live provider.** Copy `.env.example` to `.env.local`, add `OPENAI_API_KEY`, and restart. Choose a model that supports structured outputs and set its token rates in Settings. A trusted Responses-compatible gateway can be configured using the optional server-side `OPS_RESPONSES_URL`.

Credentials and the workspace database stay local and are ignored by Git. Use `DATABASE_URL=file:/absolute/path/to/workspace.db` with the same value for setup and the app to work against a separate database.

## Architecture and deployment scope

The assessment console uses Next.js, TypeScript, Prisma with SQLite, Zod validation, and React Flow. Task changes, dependency rewiring, and ownership transfers are saved transactionally with their audit records. Simulation uses a separate calculated view. Removing a local extraction record hides it from Activity and retains its duplicate-prevention record and committed tasks.

The proposed production workflow uses **Notion** as the source of truth and **Slack** for approvals and alerts. The local console previews notifications. Live delivery and the paid-trial 15-minute target remain unverified. The production planning estimate is **$0.09–$40.09 per month** at 100 extraction runs, with existing seats assumed. See the architecture notes for rates and usage assumptions.

## Verify

```bash
npm run lint
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Playwright uses an isolated SQLite database and Next.js build directory. To serve the production build locally, run `npm start` after setup and build.

## Assessment materials

- [One-page build plan](BUILD_PLAN.md)
- [Architecture and data model](ARCHITECTURE.md)
- [Operating assumptions](ASSUMPTIONS.md)
- [Setup, recovery, and management runbook](RUNBOOK.md)
- [Current four-minute demo script](DEMO_SCRIPT.md)
- [Walkthrough recording of the initial interface](docs/ops-brain-walkthrough.mp4)
