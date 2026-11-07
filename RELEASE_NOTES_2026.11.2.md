# Tuya Local Towel Dryers v2026.11.2 — Aligned managed dashboard frontend

This release aligns the Towel Dryers dashboard with the frontend-loading
approach in the user's tado X, Sauna and Renson integrations.

- **Version-specific calendar and schedule editor components.** Previously,
  the main panel had a version-specific custom element but its imported date
  picker and Vipera schedule card retained fixed tags; browser tabs could
  continue showing stale versions after an integration update.
- Keep the original `vipera-schedule-card` element and HTTP resource route
  for manually configured Lovelace dashboards.
- Preserve the existing stable loader, no-cache manifest polling, retryable
  module imports, three dashboard tabs, shared history picker and graphs.
- Continue deferring dashboard replacement while a schedule has unsaved edits,
  in-progress commands, or unacknowledged device writes.
- Add browser-free frontend regression tests and include them in ZIP-release
  validation.

No Tuya device API calls, DP26 schedule changes, energy resets, entity renaming
or Recorder statistics modifications are performed by installing this update.

Install the HACS ZIP release and restart Home Assistant. A browser tab still
using an older frontend registration may need one final hard refresh to load
the updated panel. The active loader will then use versioned assets for
subsequent updates.
