"""Heating Planner: preview schedule editor, no actuator control."""
import copy
import logging
from datetime import timedelta

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util
from homeassistant.components import websocket_api

from .const import DOMAIN, DEFAULT_PROFILES, DEFAULT_SCHEDULE
from .schedule_engine import calculate, validate_schedule

_LOGGER = logging.getLogger(__name__)
PLATFORMS = ["sensor"]
STORAGE_VERSION = 1


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    if hass.data.get(f"{DOMAIN}_ws_registered"):
        return True
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_set)
    hass.data[f"{DOMAIN}_ws_registered"] = True
    return True


@websocket_api.websocket_command({vol.Required("type"): "heating_planner/list"})
@websocket_api.async_response
async def ws_list(hass, connection, msg):
    connection.send_result(msg["id"], [
        {"entry_id": entry.entry_id, "name": entry.title}
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.entry_id in hass.data.get(DOMAIN, {})
    ])


@websocket_api.websocket_command({vol.Required("type"): "heating_planner/get", vol.Required("entry_id"): str})
@websocket_api.async_response
async def ws_get(hass, connection, msg):
    obj = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if obj is None:
        connection.send_error(msg["id"], "not_found", "Zone introuvable")
        return
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    connection.send_result(msg["id"], {
        "name": entry.title,
        "weekly": copy.deepcopy(obj["weekly"]),
        "profiles": entry.options.get("profiles", DEFAULT_PROFILES),
        "readonly": True,
    })


@websocket_api.websocket_command({
    vol.Required("type"): "heating_planner/set_schedule",
    vol.Required("entry_id"): str,
    vol.Required("weekly"): dict,
})
@websocket_api.async_response
async def ws_set(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrateur requis pour modifier les horaires")
        return
    obj = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if obj is None:
        connection.send_error(msg["id"], "not_found", "Zone introuvable")
        return
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    try:
        normalized = validate_schedule(msg["weekly"], entry.options.get("profiles", DEFAULT_PROFILES))
    except (ValueError, TypeError, KeyError) as exc:
        connection.send_error(msg["id"], "invalid_schedule", str(exc))
        return
    await obj["store"].async_save({"weekly": normalized})
    obj["weekly"] = normalized
    await obj["coordinator"].async_request_refresh()
    connection.send_result(msg["id"], {"ok": True})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}")
    saved = await store.async_load() or {}
    weekly = copy.deepcopy(DEFAULT_SCHEDULE)
    if "weekly" in saved:
        try:
            weekly = validate_schedule(saved["weekly"], entry.options.get("profiles", DEFAULT_PROFILES))
        except (ValueError, TypeError, KeyError) as exc:
            _LOGGER.error("Stored Heating Planner schedule invalid; using demo defaults: %s", exc)

    state = {"weekly": weekly, "store": store}

    async def update():
        return calculate(dt_util.utcnow(), hass.config.time_zone,
                         entry.options.get("profiles", DEFAULT_PROFILES), state["weekly"])

    coordinator = DataUpdateCoordinator(hass, logger=_LOGGER,
        name=f"{DOMAIN}_{entry.entry_id}", update_method=update,
        update_interval=timedelta(minutes=1))
    state["coordinator"] = coordinator
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = state
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    obj = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if obj:
        await obj["coordinator"].async_request_refresh()


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    result = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if result:
        entry.async_unload()
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return result
