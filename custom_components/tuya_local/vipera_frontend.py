"""Serve the Vipera schedule card and an integration-managed towel dryer sidebar."""

import json
import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)
WWW = Path(__file__).parent / "www"
MANIFEST = Path(__file__).parent / "manifest.json"
# Avoid a Lovelace dashboard URL collision (the title may still be Towel Dryers).
PANEL_PATH = "tuya-local-towel-dryers"
PANEL_OWNER_KEY = "tuya_local_towel_dryers_panel_owned"
PANEL_REGISTER_ERRORS = (ValueError, RuntimeError)
PANEL_VERSION = json.loads(MANIFEST.read_text(encoding="utf-8"))["version"]
VIPERA_CARD_URL = "/tuya_local/vipera-schedule-card.js"


async def async_register_vipera_card(hass: HomeAssistant) -> None:
    """Serve the old Lovelace resource and fully managed, versioned panel assets."""
    base = f"/tuya_local/assets/{PANEL_VERSION}"
    await hass.http.async_register_static_paths(
        [
            # Retained for existing dashboards: no resource or entity migration.
            StaticPathConfig(
                VIPERA_CARD_URL,
                str(WWW / "vipera-schedule-card.js"),
                cache_headers=False,
            ),
            # The stable loader checks the manifest and swaps to a version-specific
            # custom element, so a HACS upgrade needs no Ctrl+F5.
            StaticPathConfig(
                "/tuya_local/towel-dryers-loader.js",
                str(WWW / "towel-dryers-loader.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                f"{base}/managed-panel.js",
                str(WWW / "towel-dryers-managed-panel.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                f"{base}/towel-dryers-date-range-picker.js",
                str(WWW / "towel-dryers-date-range-picker.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                f"{base}/vipera-schedule-card.js",
                str(WWW / "vipera-schedule-card.js"),
                cache_headers=False,
            ),
            StaticPathConfig(
                "/tuya_local/manifest.json", str(MANIFEST), cache_headers=False
            ),
        ]
    )


async def async_register_towel_dryers_panel(hass: HomeAssistant) -> None:
    """Register one sidebar panel for all Vipera dryer config entries."""
    if frontend.async_panel_exists(hass, PANEL_PATH):
        if not hass.data.get(PANEL_OWNER_KEY):
            _LOGGER.warning(
                "Towel Dryers sidebar path %s is already in use; "
                "leaving the existing dashboard untouched",
                PANEL_PATH,
            )
        return
    try:
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_PATH,
            webcomponent_name="towel-dryers-loader-panel",
            sidebar_title="Towel Dryers",
            sidebar_icon="mdi:radiator",
            module_url="/tuya_local/towel-dryers-loader.js",
            require_admin=False,
        )
        hass.data[PANEL_OWNER_KEY] = PANEL_PATH
    except PANEL_REGISTER_ERRORS:
        _LOGGER.warning(
            "Could not register the Towel Dryers sidebar panel; existing "
            "Tuya Local entities and Lovelace cards are unchanged",
            exc_info=True,
        )


def async_unregister_towel_dryers_panel(hass: HomeAssistant) -> None:
    """Remove only the sidebar panel this integration registered."""
    if hass.data.get(PANEL_OWNER_KEY) != PANEL_PATH:
        return
    frontend.async_remove_panel(hass, PANEL_PATH, warn_if_unknown=False)
    hass.data.pop(PANEL_OWNER_KEY, None)
