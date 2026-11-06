"""Expose the bundled Vipera weekly schedule card as an HTTP resource."""

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

VIPERA_CARD_URL = "/tuya_local/vipera-schedule-card.js"


async def async_register_vipera_card(hass: HomeAssistant) -> None:
    """Serve the bundled card directly from this integration's directory."""
    card_path = Path(__file__).parent / "www" / "vipera-schedule-card.js"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                VIPERA_CARD_URL, str(card_path), cache_headers=False
            )
        ]
    )
