# Vipera NEX HOME towel dryers — Tuya Local HACS fork (2026.11.4)

This is a fork of [make-all/tuya-local](https://github.com/make-all/tuya-local)
with stable HACS ZIP releases, the Vipera NEX HOME device profile and the custom 7 x 24-hour schedule
editor bundled **inside the same HACS integration**.

The source of the card is kept at
`custom_components/tuya_local/www/vipera-schedule-card.js`.
**There is no need to copy the file into `/config/www`**: this fork registers a
direct Home Assistant HTTP endpoint when the integration loads.

## Version 2026.11.12 — clean everyday Towel Dryers overview

The 1–7 November comparison established that DP102 raw changes and Recorder
statistics agree on 7 November, while historical Recorder energy statistics
are missing or zero earlier. No destructive meter or Recorder reset is
warranted; continue accumulating statistics.

The everyday **Towel Dryers → Overview** panel now hides the verbose
orange raw-versus-Recorder warnings and the expanded daily evidence
audit by default. The period metric is qualified as **Recorded energy
(available history)** so partial early statistics are not presented as a
complete historical total. A small **Show energy diagnostics** toggle
below the device cards enables the old evidence and comparisons on
demand; **Hide energy diagnostics** turns them off again.

The change is frontend-only: no Tuya datapoints, cumulative counters,
device schedules, Recorder statistics, historical states, or Energy
dashboard configuration are reset, deleted, or rewritten.

## Version 2026.11.11 — daily evidence audit for towel-dryer consumption

Screenshots from 1–7 November show an unresolved difference between
Home Assistant Recorder and raw VIPERA DP102 energy-counter steps.
For the three dryers, Recorder reports 2.09 / 1.69 / 1.58 kWh versus
raw-step arithmetic 15.41 / 4.19 / 5.84 kWh.

The previous coverage diagnostic looked only at the **first and last**
statistics timestamps, which can make a partially missing middle
look fully covered. It also cannot distinguish a day with valid zero
consumption from one with **no valid energy statistics**.

The updated **Towel Dryers → Overview → Examine daily energy evidence**
disclosure is **read-only** and shows, for each calendar day in a
selected range up to 35 days:
- kWh in Recorder's `change` statistics (missing vs zero distinguished)
- kWh from consecutive DP102 raw readings, when detailed history exists
- Number of Recorder statistics buckets and raw reading changes
- Counts of possible 10%-threshold counter resets and smaller downward corrections
- First positive Recorder statistic vs first positive raw-counter event

These figures are for *diagnosis*, not a claim that raw DP102 is
measured electric consumption. A difference in available bucket
coverage or a meter discontinuity can distort the comparison. Even
inside a period's first and last Recorder timestamps, intervening
hours may be missing, so the daily evidence table is essential.

No stored statistics, entity metadata, the Energy dashboard, Tuya
device datapoints, power configuration or schedules are changed.

## Version 2026.11.10 — identify partial Recorder energy statistics coverage

A comparison of **1–7 November 2026** showed the Energy dashboard reporting
2.09 kWh / 1.69 kWh / 1.58 kWh for the three towel dryers, while detailed
raw device state changes over the same selected week summed to
15.41 kWh / 4.19 kWh / 5.84 kWh. The visible Recorder consumption
bars appeared only near the end of the week, although temperature
history showed earlier activity. The current device profile's
`total_increasing` metadata was added to this fork on 6 November 2026,
which means the earlier state history cannot automatically be counted
as valid historical Energy-dashboard statistics.

The managed panel now computes the coverage of actual Recorder
statistics and highlights **partial coverage** when the first or last
statistics bucket misses a material portion of the chosen period.
The displayed Recorder kWh total is explicitly labelled **NOT a
full-period total** when this occurs. A raw-versus-Recorder difference
is **not** called a counter error unless the statistics cover the
chosen period. For diagnosis, it displays:
- Start and end of available Recorder statistics
- Recorder kWh total for the available period
- Raw DP102 counter changes across the selected period (unverified)
- When possible, raw DP102 changes within the *overlapping* statistics
  coverage, to allow a like-for-like comparison
- Exact energy sensor entity ID

For genuinely overlapping data, the original raw-versus-Recorder
discrepancy check remains enabled. Individual reading deltas are
still plotted only when their period total reconciles with Recorder;
otherwise, Recorder interval totals are shown, along with the
coverage note.

No device reset, power setting, energy statistics update, or database
backfill is performed. We cannot assert that the raw device counter
jumps represent measured consumption: the DP102 counter
is an estimate and may jump after configuration changes.

## Version 2026.11.9 — reconcile Towel Dryers energy with HA Energy

Following a comparison of the same **1–7 November** period, the managed
dashboard's hand-calculated raw DP102 meter changes could substantially
exceed the quantities shown by Home Assistant's Energy dashboard.

- **Period kWh uses Recorder `change` statistics only**, the same
  statistics family used by Home Assistant Energy. This replaces the raw
  reading-delta sum introduced in v2026.11.8.
- Detailed raw counter steps are used for the timestamped chart **only when
  their selected-period total agrees with Recorder**, within the larger of
  0.1 kWh or 5%. Otherwise the chart shows Recorder interval consumption
  (5-minute/hour/day/week/month depending on the selected range).
- An explicit **raw vs Recorder discrepancy** warning shows both totals,
  their difference, and the precise source sensor entity ID. Use this ID to
  verify that the Energy dashboard is actually configured to the same
  counter. If it uses a different sensor, the dashboards cannot be expected
  to match.
- If Recorder has no statistics, the dashboard shows **—** instead of
  promoting unverified raw device counter changes to consumption.
- The device's separate cumulative **Total estimated energy** and
  **Total estimated cost** remain shown as read-only device reports.

The original Vipera profile warned that DP102 may jump backwards on
device reset or wattage-configuration changes. Reset detection based only
on a raw reading drop can overestimate consumption or misclassify a firmware
adjustment. Home Assistant Recorder handles total_increasing reset
semantics consistently across Energy and this dashboard, but those
statistics can still be affected by erroneous device readings.

These are all **estimated quantities**, not power measurements from a
dedicated electricity meter. No device settings, statistics, entity IDs,
energy history or schedule data are changed.

## Version 2026.11.8 — energy use at actual meter-reading timestamps

The Towel Dryers energy chart now uses **detailed Home Assistant state
history for periods of seven days or less**, showing the change in the
device-reported energy estimate between each two consecutive valid
readings. The bar's time is when the new reading arrived. Hover/tap shows
the amount in kWh and the prior reading time. There is no assumption
that each change happened during exactly one hour and no conversion
to kW.

If detailed history is unavailable or the selected range exceeds seven
days, the chart falls back to **Recorder's interval `change` totals**.
These are amounts (kWh) for each displayed interval, not rates in kWh/h.
Home Assistant ordinarily purges detailed states after 10 days while
retaining hourly long-term statistics. The chart therefore labels the
aggregation rather than implying meter-update precision in old data.

The legend shows the latest recorded Actual/Target temperatures in °C
and total selected-period estimated consumption in kWh instead of
internal Recorder sample counts. The selected-period tile uses the
same source as its chart; the cumulative lifetime kWh counter is left
unchanged. Resets and short negative corrections are distinguished
using the same threshold semantics as Home Assistant's
`total_increasing` statistics.

**Measurement caveat:** The dryer supplies an *estimated* counter.
If it updates infrequently, the increase is known only between the
two reading times. The chart cannot infer the exact moment power
was consumed or reconstruct records before HA stored them.

## Version 2026.11.7 — interval electricity consumption instead of cumulative curve

The managed **Towel Dryers → Overview** dashboard now shows **estimated
electricity consumed during each Recorder interval** rather than plotting the
ever-increasing total counter. The chart uses Home Assistant's
`recorder/statistics_during_period` `change` statistic for each
`total_increasing` estimated-energy entity. This is preferable to manually
subtracting consecutive `sum` samples because Recorder handles the
baseline at the selected date range and meter resets.

- **Per-interval bar chart:** 5-minute, hourly, daily, weekly or monthly kWh
  increments, following the existing shared date-range picker.
- **Energy used in selected period:** sum of the available Recorder
  increments for each dryer (kWh), with **—** when no statistics exist.
- **Total estimated energy:** the existing device-supplied cumulative meter
  reading remains visible and can still be opened in Home Assistant.
- **Total estimated cost:** existing cumulative cost reading remains
  unchanged; no fabricated historical cost values are introduced.
- Negative Recorder corrections, if present, are retained and indicated
  in a warning colour rather than silently treated as positive usage.

These are **device estimates, not a certified electricity meter**. No Tuya
datapoints, device schedules, entity IDs, accumulated history, or electric
heating controls are modified.

## Switching from the original Tuya Local installation

**Back up Home Assistant before switching.** Your devices, config entries,
entity IDs, and existing energy/statistics history should be retained as
long as the existing `tuya_local` config entries and registries are not
deleted. Both repositories provide the **same integration domain**,
`tuya_local`: they cannot be installed side-by-side.

1. In HACS (or **Settings → Marketplace** on Home Assistant 2026.11+),
   use the menu for **Custom repositories** and add
   `https://github.com/girtsn/tuya-local` as an **Integration**.
2. If the fork cannot be downloaded while the upstream package is installed,
   uninstall **only the upstream HACS/Marketplace repository download**,
   not the Tuya Local integration or individual devices under
   **Settings → Devices & services**. Do not delete your devices/config
   entries, and avoid restarting between removing the old package and
   installing the new one.
3. Download/install the new custom repository **girtsn/tuya-local**
   and select the **stable release `v2026.11.4`**, **not `main`**.
   HACS downloads the small versioned `tuya-local.zip` file rather than
   fetching the entire source repository. It installs into the existing
   location `/config/custom_components/tuya_local`.
4. Restart Home Assistant **once** after the fork is installed. Confirm
   that the `tuya_local` integration loads and the three dryer entities
   retain their names and entity IDs.
5. Confirm the Integration/Marketplace details show fork version
   `2026.11.4`; ensure HACS/Marketplace no longer manages the upstream
   package for the same directory.

If the repository is already listed as a custom repository, do not create
another listing for the same fork. **Refresh/reload the repository in HACS**
so the latest stable release is visible, then choose `v2026.11.4`.
If the download progress stalls again, inspect **Settings → System → Logs**
and HACS logs; the UI alone is insufficient to diagnose a GitHub/network error.

The HACS repository manifest sets `zip_release: true`,
`filename: tuya-local.zip` and `hide_default_branch: true`.
The release ZIP contains exactly the integration folder's contents, including
`www/vipera-schedule-card.js`. A GitHub Actions workflow generates this archive
from `release/v*` branches and publishes matching stable version tags.

## Self-managed Towel Dryers sidebar (recommended)

After installing stable `v2026.11.4` and restarting Home Assistant, the
Vipera integration registers one **Towel Dryers** sidebar entry with the
`mdi:radiator` icon. It manages the JavaScript resources itself, similarly
to the tado X, Sauna and Renson Ventilation dashboards.

- **Overview**: live actual and target temperatures, heating request and
  operating mode, estimated energy and cost for each installed towel dryer,
  with temperature and energy graphs directly alongside the live readings.
  One shared tado X-style period selector controls all three dryers. The
  default remains **last 7 days**, with shorter/longer and custom periods
  available. Click **Open heating controls** for the existing HA climate entity.
- **Schedules**: the same native 7 × 24-week editor, cross-dryer copy
  controls, confirmations and reported-state verification as the original card.
  The untested DP105 energy reset is not surfaced in the managed panel.


The dashboard reads existing Tuya Local entities and HA Recorder statistics;
it does not create new devices, rename entities, or modify user Lovelace
dashboards or automations. Long-term graphs require Recorder to have collected
statistics; prior unavailable measurements are not reconstructed.

**Frontend reloads:** the stable panel loader checks the installed manifest,
loads version-specific JS modules, and retries after a temporary upgrade/HTTP
failure, without requiring Ctrl+F5. The **calendar selector and schedule
editor also have release-specific custom element names**, preventing an
already-open browser tab from retaining their old code when the dashboard
changes. The original `vipera-schedule-card` Lovelace name remains available.

If HACS updated the files while Home Assistant is running, restart Home
Assistant to register the new asset paths. The loader defers replacement while
there are unsaved schedules, in-progress actions or pending writes. The new
loader cannot retroactively replace an already cached old Home Assistant
panel registration: an initial hard refresh may still be needed.

### Version 2026.11.2 frontend alignment

This update aligns the Towel Dryers dashboard with the versioned, retryable
frontend loaders in tado X, Sauna and Renson. It does not modify DP26 encoding,
device entities, history statistics, stored schedules or ventilation controls.
Automatic browser hot swapping requires the new version's loader to be active.

### Version 2026.11.3 sidebar URL conflict fix

An existing Home Assistant Lovelace dashboard named **Towel Dryers** may use
the `/towel-dryers` URL path. Previous fork versions also attempted to use
that path for the integration sidebar; when already occupied, sidebar
registration was skipped without replacing the user's dashboard.

The integration-managed panel now uses its own path:
`/tuya-local-towel-dryers`. It still appears with the **Towel Dryers**
sidebar title and `mdi:radiator` icon, so an existing Lovelace dashboard
and the new panel can coexist without changing either one's configuration.
If both are visible, Home Assistant will display two **Towel Dryers**
entries; optionally rename the existing Lovelace dashboard or hide it from
the sidebar to distinguish them. No existing dashboards are deleted.

The integration tracks panel ownership, and removes only its own sidebar
entry when the last Vipera dryer config entry is unloaded. Registration is
attempted before connection, so a temporarily offline dryer does not
suppress the sidebar. After a HACS update, restart Home Assistant for
the new path to register.

### Version 2026.11.4 chart and layout fix

The integration-managed dashboard now uses the same two-tab structure as
the tado X dashboard: **Overview** and **Schedules**. All live readings,
graphs and the common period selector are together on Overview; a separate
History tab is no longer necessary. Towel dryers appear in a fixed
basement → first floor → second floor order.

Corrected Recorder statistics timestamps (numeric Unix milliseconds; they
must not be parsed with `Date.parse`), added Home Assistant device-registry
matching for dryer sensors and support for the existing optional Vipera
temperature-history template sensors. Missing graphs identify the affected
entity so historical availability is easier to check. The x-axis uses the
selected period, not the first and last reported datapoints.

These frontend changes leave device controls, recorded historical data,
entity IDs and all weekly schedules untouched.

## Optional legacy Lovelace schedule card

The original card stays available for dashboards you already configured.
It does not need to be installed again to use the sidebar.

### Manual configuration of the legacy card (only if needed)

The integration registers and serves:

```text
/tuya_local/vipera-schedule-card.js
```

1. After the HA restart, open this URL relative to your Home Assistant
   base URL; it should display the JavaScript source, not a 404.
2. Go to **Settings → Dashboards → ⋮ → Resources** and add **one** resource:
   - **URL:** `/tuya_local/vipera-schedule-card.js?v=0.9`
   - **Resource type:** **JavaScript module**
   If the Resources menu is hidden, enable advanced mode in your
   Home Assistant profile.
3. If the current dashboard already uses the old
   `/local/vipera-schedule-card.js` resource, **edit that resource URL**
   instead of adding a duplicate; the file in `/config/www` is no longer
   needed.
4. Reload the dashboard (hard refresh if the browser cached the old
   module). Keep your existing `type: custom:vipera-schedule-card`
   dashboard card and all three `schedule_entity` mappings.

Resource registration is a **one-time UI step**; replacing the integration
through HACS/Marketplace updates the served JavaScript automatically.
The integration deliberately does not modify your dashboard configuration
or add duplicate global resources. On a future card update, you may need
to bump the `?v=` suffix to ensure browsers fetch the new JavaScript.

For dashboards with YAML-managed resources, put the URL into the
existing `lovelace.resources` list as `type: module` instead.

## Device profile and Energy dashboard

Device definition:
`custom_components/tuya_local/devices/vipera_nex_home.yaml`.

- **DP102**: device-reported **Estimated energy**, scaled by 100 to kWh;
  declared with `device_class: energy` and
  `state_class: total_increasing` for the HA Energy dashboard.
- **DP105**: an **experimental, untested** counter reset command.
  Do not press this until it has been checked on the real device.
- **DP26**: native weekly schedule; a 168-byte payload with 7 days
  of 24 one-hour slots, encoded as base64.
- **DP2 = 30°C** is treated as standby only in
  `week_program`/Schedule mode; avoid writing scheduled 30°C slots.

**Verify that DP102 actually behaves as a cumulative kWh estimate.**
The device estimates energy use rather than measuring it through a
separate power meter. Before relying on the Energy dashboard, check
Developer Tools → States and Developer Tools → Statistics for sensible
values and no statistics errors. The entity name and ID were not
changed by this patch.

## Schedule editing safety

The v0.9 card accepts OFF or 31–60°C per hourly slot and requires
confirmation for all writes. It can copy days within one towel dryer,
a full week between dryers, and one day's schedule between two dryers.

The card reads/writes DP26 through Home Assistant `text.set_value`,
and blocks conflicting writes until the destination's state matches
the intended payload. **A successful HA service call is not
independent physical confirmation**; verify persistence in Smart Life.

The optional reset button is shown only when a `reset_entity`
is configured. Resetting the dryer-side counter does not itself
erase HA's previously stored statistics, but is experimental and
may affect future statistics.

## Versioning and upstream

This fork keeps the original `tuya_local` domain to preserve the
existing device configuration and IDs, but future updates come from
`girtsn/tuya-local`, not `make-all/tuya-local`.
Rebasing on upstream releases should be handled as an intentional
fork update, preserving the Vipera profile and the HTTP resource
registration.
