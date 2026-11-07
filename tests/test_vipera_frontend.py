"""Tests for Vipera assets and managed Towel Dryers panel."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from custom_components.tuya_local import async_setup
from custom_components.tuya_local.vipera_frontend import (
    PANEL_PATH,
    PANEL_VERSION,
    VIPERA_CARD_URL,
    async_register_towel_dryers_panel,
    async_unregister_towel_dryers_panel,
)


@pytest.mark.asyncio
async def test_async_setup_serves_versioned_towel_dryer_assets():
    """Serve old Lovelace cards and all managed assets without /config/www."""
    register_static_paths = AsyncMock()
    hass = SimpleNamespace(
        http=SimpleNamespace(async_register_static_paths=register_static_paths)
    )

    assert await async_setup(hass, {}) is True
    register_static_paths.assert_awaited_once()
    paths = register_static_paths.call_args.args[0]
    assert len(paths) == 6
    routes = {static.url_path: static for static in paths}
    assert set(routes) == {
        VIPERA_CARD_URL,
        "/tuya_local/towel-dryers-loader.js",
        f"/tuya_local/assets/{PANEL_VERSION}/managed-panel.js",
        f"/tuya_local/assets/{PANEL_VERSION}/towel-dryers-date-range-picker.js",
        f"/tuya_local/assets/{PANEL_VERSION}/vipera-schedule-card.js",
        "/tuya_local/manifest.json",
    }
    assert all(not static.cache_headers for static in paths)
    assert all(Path(static.path).is_file() for static in routes.values())
    assert Path(routes[VIPERA_CARD_URL].path).name == "vipera-schedule-card.js"
    assert (
        "customElements.get('vipera-schedule-card')"
        in Path(routes[VIPERA_CARD_URL].path).read_text()
    )


@pytest.mark.asyncio
async def test_panel_is_registered_once_with_towel_dryer_icon():
    """Multiple Vipera config entries must not add duplicate sidebar panels."""
    hass = SimpleNamespace(data={})
    with (
        patch(
            "custom_components.tuya_local.vipera_frontend.frontend.async_panel_exists",
            side_effect=[False, True],
        ),
        patch(
            "custom_components.tuya_local.vipera_frontend.panel_custom.async_register_panel",
            new_callable=AsyncMock,
        ) as register,
    ):
        await async_register_towel_dryers_panel(hass)
        await async_register_towel_dryers_panel(hass)

    register.assert_awaited_once()
    assert PANEL_PATH == "tuya-local-towel-dryers"
    assert register.call_args.kwargs["frontend_url_path"] == PANEL_PATH
    assert register.call_args.kwargs["sidebar_title"] == "Towel Dryers"
    assert register.call_args.kwargs["sidebar_icon"] == "mdi:radiator"
    assert (
        register.call_args.kwargs["module_url"] == "/tuya_local/towel-dryers-loader.js"
    )


@pytest.mark.asyncio
async def test_existing_lovelace_towel_dryers_dashboard_does_not_block_panel():
    """A dashboard at /towel-dryers must not collide with the managed sidebar."""
    hass = SimpleNamespace(data={})
    with (
        patch(
            "custom_components.tuya_local.vipera_frontend.frontend.async_panel_exists",
            side_effect=lambda _hass, path: path == "towel-dryers",
        ),
        patch(
            "custom_components.tuya_local.vipera_frontend.panel_custom.async_register_panel",
            new_callable=AsyncMock,
        ) as register,
    ):
        await async_register_towel_dryers_panel(hass)

    register.assert_awaited_once()
    assert register.call_args.kwargs["frontend_url_path"] != "towel-dryers"
    assert register.call_args.kwargs["sidebar_title"] == "Towel Dryers"


@pytest.mark.asyncio
async def test_unregister_does_not_remove_an_existing_users_panel():
    """Never remove another dashboard on config-entry unload."""
    hass = SimpleNamespace(data={})
    with patch(
        "custom_components.tuya_local.vipera_frontend.frontend.async_remove_panel"
    ) as remove:
        async_unregister_towel_dryers_panel(hass)
        remove.assert_not_called()

        hass.data["tuya_local_towel_dryers_panel_owned"] = PANEL_PATH
        async_unregister_towel_dryers_panel(hass)
        remove.assert_called_once_with(hass, PANEL_PATH, warn_if_unknown=False)
        assert not hass.data


def test_managed_panel_routes_and_imports_match_registered_assets():
    """Prevent regressions from changing an asset URL while renaming panel route."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "tuya_local"
        / "www"
        / "towel-dryers-managed-panel.js"
    ).read_text()
    assert '"/tuya-local-towel-dryers"' in source
    assert '"/tuya-local-towel-dryers/"' in source
    assert "./towel-dryers-date-range-picker.js" in source
    assert "./tuya-local-towel-dryers-date-range-picker.js" not in source
