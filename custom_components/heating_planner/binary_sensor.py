"""Read-only preheat status."""
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from .const import DOMAIN

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]['coordinator']
    async_add_entities([PreheatActive(coordinator, entry)])

class PreheatActive(CoordinatorEntity, BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_name = 'Préchauffage actif'
    _attr_icon = 'mdi:radiator'

    def __init__(self, coordinator, entry):
        super().__init__(coordinator)
        self._attr_unique_id = f'{entry.entry_id}_preheat_active'
        self._attr_device_info = {
            'identifiers': {(DOMAIN, entry.entry_id)},
            'name': entry.title,
            'manufacturer': 'Heating Planner (preview)',
        }

    @property
    def is_on(self):
        return bool(self.coordinator.data.get('preheat_active', False))
