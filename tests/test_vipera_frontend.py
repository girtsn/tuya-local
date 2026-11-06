"""Tests for the Vipera dashboard card served from the integration."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from custom_components.tuya_local import async_setup
from custom_components.tuya_local.vipera_frontend import VIPERA_CARD_URL


@pytest.mark.asyncio
async def test_async_setup_serves_bundled_vipera_schedule_card():
    """No /config/www copy is needed to serve the included card."""
    register_static_paths = AsyncMock()
    hass = SimpleNamespace(
        http=SimpleNamespace(async_register_static_paths=register_static_paths)
    )

    assert await async_setup(hass, {}) is True

    register_static_paths.assert_awaited_once()
    paths = register_static_paths.call_args.args[0]
    assert len(paths) == 1

    static_path = paths[0]
    assert static_path.url_path == VIPERA_CARD_URL
    assert static_path.cache_headers is False

    js_file = Path(static_path.path)
    assert js_file.is_file()
    assert js_file.name == "vipera-schedule-card.js"
    assert "customElements.define('vipera-schedule-card'" in js_file.read_text()
