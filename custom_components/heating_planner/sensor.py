"""Read-only preview entities."""
from homeassistant.components.sensor import SensorEntity, SensorDeviceClass
from homeassistant.const import UnitOfTemperature
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN

SENSORS = (
    ("target", "Consigne actuelle", "target"),
    ("next_target", "Prochaine consigne", "next_target"),
    ("next_change", "Prochain changement", "next_change"),
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
        if key == "next_change":
            self._attr_device_class = SensorDeviceClass.TIMESTAMP
        else:
            self._attr_device_class = SensorDeviceClass.TEMPERATURE
            self._attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS

    @property
    def native_value(self):
        return self.coordinator.data[self._data_key]
