"""Heating Planner preview: no climate or MQTT writes."""
from datetime import timedelta
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import DOMAIN, DEFAULT_PROFILES, DEFAULT_SCHEDULE
from .schedule_engine import calculate

PLATFORMS = ["sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async def update():
        return calculate(
            dt_util.utcnow(),
            hass.config.time_zone,
            entry.options.get("profiles", DEFAULT_PROFILES),
            DEFAULT_SCHEDULE,
        )

    coordinator = DataUpdateCoordinator(
        hass,
        logger=__import__("logging").getLogger(__name__),
        name=f"{DOMAIN}_{entry.entry_id}",
        update_method=update,
        update_interval=timedelta(minutes=1),
    )
    # Refresh calculated sensors whenever the user changes profile temperatures.
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    coordinator = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if coordinator is not None:
        await coordinator.async_request_refresh()


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    result = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if result:
        entry.async_unload()
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return result
