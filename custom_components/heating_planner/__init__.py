"""Heating Planner: preview schedule editor, no actuator control."""
import copy
import asyncio
import logging
from datetime import timedelta

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers import entity_registry as er
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util
from homeassistant.components import websocket_api

from .calculation import calculate_cycle, configuration_key
from .const import DOMAIN, DEFAULT_PROFILES, DEFAULT_SCHEDULE, room_defaults
from .schedule_engine import validate_schedule, validate_exceptions
from .wake_engine import validate_wakes
from .override_engine import validate_override
from .temperatures import apply_temperatures

_LOGGER = logging.getLogger(__name__)
PLATFORMS = ["sensor", "binary_sensor"]
STORAGE_VERSION = 1


def can_control_zone(hass, connection, entry_id):
    user = connection.user
    if user is None:
        return False
    if user.is_admin:
        return True
    registry = er.async_get(hass)
    target = registry.async_get_entity_id("sensor", DOMAIN, f"{entry_id}_target")
    return bool(target and user.permissions.check_entity(target, POLICY_CONTROL))


async def store_zone_change(obj, key, value):
    async with obj["write_lock"]:
        saved = {name: obj[name] for name in ("weekly", "exceptions", "override")}
        saved[key] = value
        await obj["store"].async_save(saved)
        obj[key] = value


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    if hass.data.get(f"{DOMAIN}_ws_registered"):
        return True
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_set)
    websocket_api.async_register_command(hass, ws_set_exceptions)
    websocket_api.async_register_command(hass, ws_wakes_get)
    websocket_api.async_register_command(hass, ws_wakes_set)
    websocket_api.async_register_command(hass, ws_set_mode)
    websocket_api.async_register_command(hass, ws_set_temperatures)
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
        "effective": {key: value.isoformat() if hasattr(value, "isoformat") else value
                      for key, value in (obj["coordinator"].data or {}).items()},
        "mode_temperatures": {
            "away": entry.options.get("away_temperature", 15.0),
            "boost": entry.options.get("boost_temperature", entry.options.get("profiles", DEFAULT_PROFILES).get("comfort", 21.0)),
        },
        "permissions": {"edit": connection.user.is_admin, "control": can_control_zone(hass, connection, msg["entry_id"])},
        "readonly": not connection.user.is_admin,
        "preheat_minutes": entry.options.get("preheat_minutes", 0),
        "override": copy.deepcopy(obj["override"]),
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
    await store_zone_change(obj, "weekly", normalized)
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
    await store_zone_change(obj, "exceptions", normalized)
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


@websocket_api.websocket_command({
    vol.Required("type"): "heating_planner/set_temperatures",
    vol.Required("entry_id"): str,
    vol.Required("profiles"): dict,
    vol.Optional("away_temperature"): vol.Any(int, float),
    vol.Optional("boost_temperature"): vol.Any(int, float),
})
@websocket_api.async_response
async def ws_set_temperatures(hass, connection, msg):
    """Update Nuit/Éco/Confort and the Absent/Boost defaults from the card (administrators)."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrateur requis pour modifier les températures")
        return
    obj = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if obj is None or entry is None:
        connection.send_error(msg["id"], "not_found", "Zone introuvable")
        return
    try:
        options = apply_temperatures(dict(entry.options), msg["profiles"], msg.get("away_temperature"),
                                     msg.get("boost_temperature"), DEFAULT_PROFILES)
    except ValueError as exc:
        connection.send_error(msg["id"], "invalid_temperatures", str(exc))
        return
    # Same storage as the options flow; its update listener refreshes the coordinator too.
    hass.config_entries.async_update_entry(entry, options=options)
    await obj["coordinator"].async_request_refresh()
    connection.send_result(msg["id"], {"ok": True, "profiles": options["profiles"]})


@websocket_api.websocket_command({
    vol.Required("type"): "heating_planner/set_mode",
    vol.Required("entry_id"): str,
    vol.Required("override"): dict,
})
@websocket_api.async_response
async def ws_set_mode(hass, connection, msg):
    if not can_control_zone(hass, connection, msg["entry_id"]):
        connection.send_error(msg["id"], "unauthorized", "Vous ne pouvez pas contrôler cette zone")
        return
    obj = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if obj is None:
        connection.send_error(msg["id"], "not_found", "Zone introuvable")
        return
    try:
        override = validate_override(msg["override"], dt_util.utcnow())
    except (ValueError, TypeError) as exc:
        connection.send_error(msg["id"], "invalid_mode", str(exc))
        return
    await store_zone_change(obj, "override", override)
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
    override = saved.get("override", {"mode": "planning"})
    if not isinstance(override, dict):
        override = {"mode": "planning"}
    state = {"weekly": weekly, "exceptions": exceptions, "override": override, "store": store, "write_lock": asyncio.Lock()}

    calculation_cache = {}

    def reading(entity_id):
        entity = hass.states.get(entity_id) if entity_id else None
        if entity is None or entity.state in ("unknown", "unavailable"):
            return None
        return entity.attributes.get("current_temperature") if entity_id.startswith("climate.") else entity.state

    def snapshot():
        options = {**room_defaults(entry), **copy.deepcopy(dict(entry.options))}
        return {"now": dt_util.utcnow(), "timezone": hass.config.time_zone,
                "zone": entry.entry_id, "options": options,
                "profiles": copy.deepcopy(options.get("profiles", DEFAULT_PROFILES)),
                "weekly": copy.deepcopy(state["weekly"]), "exceptions": copy.deepcopy(state["exceptions"]),
                "wakes": copy.deepcopy(hass.data[f"{DOMAIN}_wakes"]), "override": copy.deepcopy(state["override"]),
                "temperature": reading(options["temperature_entity"]),
                "slope": reading(options["slope_entity"])}

    async def update():
        nonlocal calculation_cache
        while True:
            captured = snapshot()
            effective, updated_cache = await hass.async_add_executor_job(calculate_cycle, captured, calculation_cache)
            # An edit received while the worker ran must not publish an old plan.
            if configuration_key(captured) != configuration_key(snapshot()):
                continue
            calculation_cache = updated_cache
            return effective

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
