# Tuya Local fork 2026.11.16 — Towel Dryers calendar fixes

- Towel Dryers history picker now uses the **Home Assistant timezone** for calendar-day boundaries, independent of the viewing phone/browser.
- DST-safe yesterday, daily/monthly presets and previous/next period navigation.
- One tap to choose an exact day; a second tap extends the selection to an inclusive range.
- Preserve the precise rolling **Last 24 hours** interval instead of forcing it to calendar midnights.
- New timezone, DST and single-day regression tests.
- No device definitions, schedules or existing energy statistics changed.
