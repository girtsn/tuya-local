# Tuya Local fork v2026.11.15

- Remove the deprecated `CONN_CLASS_LOCAL_PUSH` import and the obsolete config-flow `CONNECTION_CLASS` declaration, resolving the Home Assistant 2026.11 warning (removal scheduled in 2027.5).
- Retain the supported `"iot_class": "local_push"` declaration in `manifest.json`.
- Preserve local connection behavior, discovery, existing configuration entries, device IDs, entity IDs, and all device controls; no functional change.
- Include a regression test to prevent reintroducing the deprecated constant.
