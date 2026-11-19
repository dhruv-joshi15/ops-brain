# Local runbook

```bash
npm ci
npm run setup
npm run dev
```

Open http://127.0.0.1:3000. On another day, set `OPS_DEMO_DATE=2026-11-19` in `.env.local` for the assessment walkthrough.

| Symptom | Action |
| --- | --- |
| Custom notes need a provider | Load the synthetic sample, or set `OPENAI_API_KEY` in `.env.local` and restart. |
| Provider timeout or quota error | Check connectivity, provider billing and Settings, then retry. Inspect Activity for the recorded failure. |
| Model output fails validation | Clarify the notes and retry. Inspect Activity for the original response where available. |
| Review cannot save | Resolve missing fields, duplicate titles or rejected dependencies. Reopen the existing review from Activity if it was already committed. |
| Database unavailable | Run `npm run setup` with the same `DATABASE_URL` used by the server, then restart. |
| Existing data must be preserved | Point setup and the server to a new absolute `DATABASE_URL=file:/path/to/new-demo.db`. |
| Clean sample replay | In sample mode, select Settings → Reset sample demo → Confirm reset. This removes synthetic runs and their committed tasks, and unlinks any remaining tasks that referenced those sample tasks. Other task records, team members, goals, and rule versions are retained. |

```bash
npm run lint
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Playwright uses a separate SQLite file and Next.js output directory. Integrations are unconfigured. Slack previews make no network requests to Slack.


## Managing records

- Use a task’s three-dot menu to edit, archive, restore, or delete it. Deletion asks how to handle downstream links. The entire change is rejected if a replacement would create a cycle. Archived unfinished prerequisites still block linked active work until restored, completed, or unlinked.
- Use **Manage goals** to edit or archive a goal, or delete it after choosing to move or unassign its tasks. Archived goals stay linked to their existing tasks.
- In **Settings → Team members**, remove a person by choosing an active replacement or unassigning their tasks and goals. Deactivation preserves assignments and excludes the person from new assignments.
- In **Activity**, deletion hides a local extraction record. A retained record prevents the same meeting from creating duplicate tasks, and its committed tasks remain available. Select demo logs for clearing or reset demo activity to hide sample runs and clear sample change events. Provider runs and protected workspace events are retained.
