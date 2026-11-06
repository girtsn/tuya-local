# Vipera NEX HOME towel dryers — Tuya Local HACS fork (2026.10.2)

This is a fork of [make-all/tuya-local](https://github.com/make-all/tuya-local)
with stable HACS ZIP releases, the Vipera NEX HOME device profile and the custom 7 x 24-hour schedule
editor bundled **inside the same HACS integration**.

The source of the card is kept at
`custom_components/tuya_local/www/vipera-schedule-card.js`.
**There is no need to copy the file into `/config/www`**: this fork registers a
direct Home Assistant HTTP endpoint when the integration loads.

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
   and select the **stable release `v2026.10.2`**, **not `main`**.
   HACS downloads the small versioned `tuya-local.zip` file rather than
   fetching the entire source repository. It installs into the existing
   location `/config/custom_components/tuya_local`.
4. Restart Home Assistant **once** after the fork is installed. Confirm
   that the `tuya_local` integration loads and the three dryer entities
   retain their names and entity IDs.
5. Confirm the Integration/Marketplace details show fork version
   `2026.10.2`; ensure HACS/Marketplace no longer manages the upstream
   package for the same directory.

If the repository is already listed as a custom repository, do not create
another listing for the same fork. **Refresh/reload the repository in HACS**
so the latest stable release is visible, then choose `v2026.10.2`.
If the download progress stalls again, inspect **Settings → System → Logs**
and HACS logs; the UI alone is insufficient to diagnose a GitHub/network error.

The HACS repository manifest sets `zip_release: true`,
`filename: tuya-local.zip` and `hide_default_branch: true`.
The release ZIP contains exactly the integration folder's contents, including
`www/vipera-schedule-card.js`. A GitHub Actions workflow generates this archive
from `release/v*` branches and publishes matching stable version tags.

## Use the dashboard card without any file copying

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
