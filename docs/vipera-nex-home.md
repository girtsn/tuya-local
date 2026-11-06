# Vipera NEX HOME towel dryers — local Home Assistant fork

This repository includes a custom Tuya Local device profile and the experimental
`vipera-schedule-card` Lovelace dashboard card.

## Device profile and Energy dashboard

The device configuration is in
`custom_components/tuya_local/devices/vipera_nex_home.yaml`.

- **DP102**: device-reported **Estimated energy**, scaled by 100 to kWh,
  with `device_class: energy` and `state_class: total_increasing`.
  This is **an estimate from the dryer**, not a separately metered consumption value.
- **DP105**: an **experimental reset** action for the device-side energy
  counter. It has not been write-tested. Do not press casually.
- **DP26**: device-reported and device-written native weekly schedule
  (168 bytes = 7 days x 24 hourly slots, transmitted as base64).
- The reserved `30°C` value is treated as Schedule standby only when the
  dryer's selected operating mode is `week_program`. Do not schedule
  30°C using the card.

The DP102 value **must be cumulative while in operation** for the
`total_increasing` classification to be appropriate. A drop to zero after
a deliberate DP105 reset is handled as a counter reset by HA's statistics,
but it is important to verify device behavior and unit scaling using
Developer Tools → States and Developer Tools → Statistics before relying
on the totals. A cumulative estimate is not a calibrated power meter.

The energy sensor's existing configuration/unique identity has not been
renamed by this patch. If already selected in the Energy dashboard, check
whether it remains selected after Home Assistant restarts.

## Installing the fork

Only one implementation of the `tuya_local` integration can occupy
`/config/custom_components/tuya_local` at a time. Do not install two
copies simultaneously. Back up your Home Assistant configuration first.

For manual installation or testing from the feature branch:

1. Download the feature branch and copy its
   `custom_components/tuya_local/` folder over
   `/config/custom_components/tuya_local/` on your HA installation.
2. Restart Home Assistant (configuration checks before restart are useful).
3. Existing Tuya Local config entries should be retained; confirm all
   three towel dryers, their names, and their DP102 entities are present.
4. Check **Settings → Dashboards → Energy → Individual devices** and
   **Developer Tools → Statistics** for validation errors.

Once this branch is merged into the fork's default `main` branch, the
fork can be configured as a HACS custom integration repository at
`https://github.com/girtsn/tuya-local`. Replace the original source
rather than running both upstream and fork as separate integrations.

## Schedule card

The card source is bundled with the integration at
`custom_components/tuya_local/www/vipera-schedule-card.js`.

**HACS integration installation does not automatically register a Lovelace
JavaScript resource.** After installing this fork:

1. Copy
   `/config/custom_components/tuya_local/www/vipera-schedule-card.js`
   to `/config/www/vipera-schedule-card.js`.
   Create `/config/www` if necessary.
2. In **Settings → Dashboards → Resources**, register the URL
   `/local/vipera-schedule-card.js?v=0.9` as a **JavaScript module**
   (if Resources is not shown, enable advanced mode).
3. Reload the dashboard, bypassing the browser cache if necessary.
4. Reuse your existing `type: custom:vipera-schedule-card` dashboard
   card configuration, preserving the three `schedule_entity` IDs.

The card reads and writes DP26 via Home Assistant `text.set_value`
services. It validates a full 168-byte week, allows target temperatures
31–60°C or OFF, and requires confirmation for writes. It can copy a day
within a dryer, a full week between dryers, and a specific day between
dryers. It holds further writes if HA has not reported the expected
destination schedule.

**A successful HA service call is not independent proof of persistence
on the physical dryer.** After writing, compare the result with Smart Life.

The card optionally displays a DP105 reset button if a `reset_entity`
is configured for that dryer. This action is experimental. Resetting
the device counter need not delete Home Assistant historical statistics,
but can affect future totals if the firmware behaves unexpectedly.

## Updating

The JavaScript source is versioned with the integration, but the copy
in `/config/www` is a separate file. Repeat the copy and update the
resource cache-busting query parameter when the card changes.
