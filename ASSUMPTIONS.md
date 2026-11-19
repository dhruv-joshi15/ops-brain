# Assumptions

- The synthetic sample is dated November 19, 2026. Calendar days and Asia/Kolkata are used throughout the console.
- Production planning assumptions are Monday through Friday, 10:00–18:00. The console does not calculate working-day calendars or schedule deliveries.
- The seeded launch goal has importance 3. Fulfillment and content have importance 2. Settings versions the global weight and priority thresholds.
- Priority combines importance, open downstream reach, deadline urgency and forecast slip. Due date and task ID break ties.
- Forecasts preserve existing gaps. The simulation uses known durations to derive an earliest completion bound; an unknown duration contributes zero to the bound. A bound after the deadline indicates a conflict under the entered scenario. Other projected slips indicate potential risk.
- The proposed production workflow drafts alerts for affected owners, sends through an idempotent outbox, and escalates unresolved goal risk to the goal lead. The assessment console shows drafts.
- Identical normalized notes and meeting date represent one meeting. Separate meetings should have distinct notes or dates.
