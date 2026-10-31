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
from .schedule_engine import calculate, validate_schedule, validate_exceptions
from .wake_engine import validate_wakes
from .preheat_engine import calculate_with_preheat

_LOGGER = logging.getLogger(__name__)
PLATFORMS = ["sensor", "binary_sensor"]
STORAGE_VERSION = 1


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    if hass.data.get(f"{DOMAIN}_ws_registered"):
        return True
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_set)
    websocket_api.async_register_command(hass, ws_set_exceptions)
    websocket_api.async_register_command(hass, ws_wakes_get)
    websocket_api.async_register_command(hass, ws_wakes_set)
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
        "exceptions": copy.deepcopy(obj["exceptions"]),
        "profiles": entry.options.get("profiles", DEFAULT_PROFILES),
        "readonly": True,
        "preheat_minutes": entry.options.get("preheat_minutes", 0),
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
    await obj["store"].async_save({"weekly": normalized, "exceptions": obj["exceptions"]})
    obj["weekly"] = normalized
    await obj["coordinator"].async_request_refresh()
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({
    vol.Required("type"): "heating_planner/set_exceptions",
    vol.Required("entry_id"): str,
    vol.Required("exceptions"): dict,
})
@websocket_api.async_response
async def ws_set_exceptions(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrateur requis")
        return
    obj = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if obj is None:
        connection.send_error(msg["id"], "not_found", "Zone introuvable")
        return
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    try:
        normalized = validate_exceptions(msg["exceptions"], entry.options.get("profiles", DEFAULT_PROFILES))
    except (ValueError, TypeError, KeyError) as exc:
        connection.send_error(msg["id"], "invalid_exceptions", str(exc))
        return
    await obj["store"].async_save({"weekly": obj["weekly"], "exceptions": normalized})
    obj["exceptions"] = normalized
    await obj["coordinator"].async_request_refresh()
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "heating_planner/get_wakes"})
@websocket_api.async_response
async def ws_wakes_get(hass, connection, msg):
    await _load_wakes(hass)
    connection.send_result(msg["id"], {"events": copy.deepcopy(hass.data[f"{DOMAIN}_wakes"]),
        "zones": [{"entry_id": entry.entry_id, "name": entry.title,
                   "profiles": list(entry.options.get("profiles", DEFAULT_PROFILES))}
                  for entry in hass.config_entries.async_entries(DOMAIN)
                  if entry.entry_id in hass.data.get(DOMAIN, {})]})


@websocket_api.websocket_command({vol.Required("type"): "heating_planner/set_wakes", vol.Required("events"): list})
@websocket_api.async_response
async def ws_wakes_set(hass, connection, msg):
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrateur requis")
        return
    await _load_wakes(hass)
    zones = {entry.entry_id: entry.options.get("profiles", DEFAULT_PROFILES)
             for entry in hass.config_entries.async_entries(DOMAIN)
             if entry.entry_id in hass.data.get(DOMAIN, {})}
    try:
        normalized = validate_wakes(msg["events"], zones)
    except (ValueError, TypeError, KeyError) as exc:
        connection.send_error(msg["id"], "invalid_wakes", str(exc))
        return
    await hass.data[f"{DOMAIN}_wakes_store"].async_save({"events": normalized})
    hass.data[f"{DOMAIN}_wakes"] = normalized
    for obj in hass.data.get(DOMAIN, {}).values():
        await obj["coordinator"].async_request_refresh()
    connection.send_result(msg["id"], {"ok": True})


async def _load_wakes(hass):
    if f"{DOMAIN}_wakes" in hass.data:
        return
    store = Store(hass, 1, f"{DOMAIN}.shared_wakes")
    saved = await store.async_load() or {}
    hass.data[f"{DOMAIN}_wakes_store"] = store
    hass.data[f"{DOMAIN}_wakes"] = saved.get("events", [])


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    await _load_wakes(hass)
    store = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}")
    saved = await store.async_load() or {}
    weekly = copy.deepcopy(DEFAULT_SCHEDULE)
    if "weekly" in saved:
        try:
            weekly = validate_schedule(saved["weekly"], entry.options.get("profiles", DEFAULT_PROFILES))
        except (ValueError, TypeError, KeyError) as exc:
            _LOGGER.error("Stored Heating Planner schedule invalid; using demo defaults: %s", exc)

    try:
        exceptions = validate_exceptions(saved.get("exceptions", {}), entry.options.get("profiles", DEFAULT_PROFILES))
    except (ValueError, TypeError, KeyError) as exc:
        _LOGGER.error("Stored Heating Planner exceptions invalid; ignoring: %s", exc)
        exceptions = {}
    state = {"weekly": weekly, "exceptions": exceptions, "store": store}

    async def update():
        return calculate_with_preheat(dt_util.utcnow(), hass.config.time_zone,
                         entry.options.get("profiles", DEFAULT_PROFILES), state["weekly"], state["exceptions"],
                         hass.data[f"{DOMAIN}_wakes"], entry.entry_id, entry.options.get("preheat_minutes", 0))

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
