# Tuya Local fork v2026.11.5 — Towel Dryers mobile navigation

- Restore Home Assistant's native sidebar in the integration-managed Towel Dryers dashboard when accessed from the mobile Companion App or other narrow screens.
- Add an accessible hamburger menu beside the Towel Dryers heading; clicking it emits Home Assistant's standard navigation event across the dashboard shadow DOM.
- Keep device controls, the Overview and Schedules tabs, long-term histories and date picker unchanged.
- Bump the integration manifest version so the versioned dashboard loader retrieves the new frontend implementation.
- Existing Tuya Local configuration entries and schedule cards are preserved.

This release uses the repository's normal HACS ZIP packaging workflow and provides the `tuya-local.zip` release asset.
