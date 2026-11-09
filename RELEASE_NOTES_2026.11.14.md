# Tuya Local fork v2026.11.14

- Update Tuya climate and water-heater temperature properties to Home Assistant 2026.11's `native_temperature_unit`, `native_current_temperature`, `native_target_temperature`, and native target high/low properties.
- Keep native device values, device-dependent Celsius/Fahrenheit determination, target ranges, target-temperature step, and device-command logic unchanged.
- Remove climate and water-heater deprecation warnings scheduled to become errors in Home Assistant 2027.11.
- Set the minimum HACS Home Assistant version to 2026.11.0.
