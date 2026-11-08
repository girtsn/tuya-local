# Tuya Local / Vipera 2026.11.13

## Fixed
- The dashboard date selector now follows **Home Assistant → User profile → First day of the week**, instead of always relying on the browser's locale.
- Both **This week** history ranges and the calendar's weekday columns respect the profile preference. **Automatic** follows Home Assistant's selected language.
- Changing the Home Assistant week-start preference updates open date selectors without altering stored measurements.
- The Vipera towel dryer's weekly schedule grid and day selectors follow the display preference, with the device's DP26 Monday-indexed data and write protections unchanged.

## Verification
- Offline regression coverage added for Monday/Sunday/Saturday, automatic en-GB/en-US week starts, and user preference changes. Device schedules and historical recordings are not rewritten.
