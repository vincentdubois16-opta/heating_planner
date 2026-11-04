"""Read-only preview entities."""
from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.const import UnitOfTemperature
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN

SENSORS = (
    ("target", "Consigne actuelle", "target"),
    ("next_target", "Prochaine consigne", "next_target"),
    ("next_change", "Prochain changement", "next_change"),
    ("base_target", "Consigne sans préchauffage", "base_target"),
    ("preheat_target", "Consigne de préchauffage", "preheat_target"),
    ("preheat_start", "Début préchauffage", "preheat_start"),
    ("active_mode", "Mode actif", "active_mode"),
    ("override_until", "Fin du mode temporaire", "override_until"),
)


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities(
        HeatingPlannerSensor(coordinator, entry, key, label, data_key)
        for key, label, data_key in SENSORS
    )


class HeatingPlannerSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry, key, label, data_key):
        super().__init__(coordinator)
        self._key = key
        self._data_key = data_key
        self._attr_name = label
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "Heating Planner (preview)",
        }
        if key in ("next_change", "preheat_start", "override_until"):
            self._attr_device_class = SensorDeviceClass.TIMESTAMP
        elif key != "active_mode":
            self._attr_device_class = SensorDeviceClass.TEMPERATURE
            self._attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS

    @property
    def native_value(self):
        return self.coordinator.data[self._data_key]

    @property
    def extra_state_attributes(self):
        if self._key != "target":
            return None
        return {key: value.isoformat() if hasattr(value, "isoformat") else value
                for key, value in self.coordinator.data.items()
                if key.startswith(("dynamic_", "away_return_")) or key == "preheat_strategy"}
