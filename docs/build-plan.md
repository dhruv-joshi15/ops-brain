# Ops Brain · One-page build plan

**Outcome.** Capture roughly 80% of the meeting-to-prioritized-work workflow for a 5–10 person Mumbai D2C team. Team members can see what to do and whom they block. Founders can see goals at risk, trace the cause, and decide where to intervene.

| Milestone | Deliverable | Exit check |
| --- | --- | --- |
| 1 · Capture and review | Map Notion goals, team members, and tasks. Convert multilingual notes into evidence-backed proposals. Give reviewers an edit, approve, and reject path. | One sample yields four complete proposals and three valid dependency links. Review leaves a durable record. |
| 2 · Track impact | Derive open work, blockers, risk, and stable rankings from the approved task graph. Preview a slip and follow-up drafts. | An 8-day design slip moves development, QA, and campaign forecasts and puts the website goal Off Track. |
| 3 · Production v1 | Connect Notion, a managed workflow runner, and a Slack app. Add reviewer identity, an idempotent outbox, alert receipts, and a reconciliation job. | In the paid trial, exercise a four-task chain and measure time from a Notion slip to delivery to each affected owner. Compare recomputed priorities with founder judgment. |
| 4 · Tune over a pilot | Review representative English, Hindi, Gujarati, and mixed-language runs. Record edits, time spent, forecast lead time, and model cost. Add task-specific recurring agents after the approval path is reliable. | Compare pilot measurements with the targets below. |

**Target measures.** At least 90% of active tasks have owners, dates, goal links, and applicable dependencies. Flag slips at least three days before affected downstream deadlines. At least 80% of proposals are approved without edits. Daily priorities match founder judgment on at least eight of ten spot-checked days. Administration takes under 15 minutes per week.

**Trial target.** Notify all affected owners within 15 minutes of an upstream slip and recompute priorities. Measure against real Notion and Slack timestamps during the paid trial.

**Engineering boundary.** The assessment uses a local Next.js console and SQLite so a reviewer can run it offline with synthetic notes. Production keeps tasks in Notion, uses Slack for quick interactions, and puts workflow and audit state in managed services. Build the graph, ranking, validation, and approval logic. Buy the model, workflow runtime, and collaboration interfaces.
