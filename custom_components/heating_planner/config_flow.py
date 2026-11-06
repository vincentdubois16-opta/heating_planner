"""Heating Planner configuration and per-zone profile options."""
import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN, DEFAULT_PROFILES, room_defaults


class HeatingPlannerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            name = user_input["name"].strip()
            if name and not any(item.title.strip().casefold() == name.casefold()
                                for item in self._async_current_entries()):
                await self.async_set_unique_id("room:" + name.casefold())
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=name, data={"name": name})
            return self.async_show_form(
                step_id="user", errors={"name": "invalid_room_name"},
                data_schema=vol.Schema({vol.Required("name", default=name): str}),
            )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("name", default=""): str}),
        )

    @staticmethod
    def async_get_options_flow(config_entry):
        return HeatingPlannerOptionsFlow()


class HeatingPlannerOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data={
                **self.config_entry.options,
                "dynamic_preheat": user_input["dynamic_preheat"],
                "temperature_entity": user_input["temperature_entity"].strip(),
                "slope_entity": user_input["slope_entity"].strip(),
                "slope_unit": user_input["slope_unit"],
                "max_preheat_minutes": user_input["max_preheat_minutes"],
                "away_temperature": float(user_input["away_temperature"]),
                "boost_temperature": float(user_input["boost_temperature"]),
                "profiles": {k: float(user_input[k]) for k in DEFAULT_PROFILES},
                "preheat_minutes": int(user_input["preheat_minutes"])
            })
        defaults = room_defaults(self.config_entry)
        existing = self.config_entry.options.get("profiles", DEFAULT_PROFILES)
        schema = {
            vol.Required(key, default=float(existing.get(key, value))):
                vol.All(vol.Coerce(float), vol.Range(min=5, max=35))
            for key, value in DEFAULT_PROFILES.items()
        }
        schema[vol.Required("preheat_minutes", default=int(self.config_entry.options.get("preheat_minutes", 0)))] = vol.All(vol.Coerce(int), vol.Range(min=0, max=360))
        for key, default in (("away_temperature", 15.0), ("boost_temperature", float(existing.get("comfort", 21.0)))):
            schema[vol.Required(key, default=float(self.config_entry.options.get(key, default)))] = vol.All(vol.Coerce(float), vol.Range(min=5, max=35))
        schema[vol.Required("dynamic_preheat", default=self.config_entry.options.get("dynamic_preheat", False))] = bool
        schema[vol.Required("temperature_entity", default=self.config_entry.options.get("temperature_entity", defaults["temperature_entity"]))] = str
        schema[vol.Required("slope_unit", default=self.config_entry.options.get("slope_unit", "hour"))] = vol.In({"hour": "°C/h", "minute": "°C/min"})
        schema[vol.Required("slope_entity", default=self.config_entry.options.get("slope_entity", defaults["slope_entity"]))] = str
        schema[vol.Required("max_preheat_minutes", default=self.config_entry.options.get("max_preheat_minutes", 180))] = vol.All(vol.Coerce(int), vol.Range(min=0, max=360))
        return self.async_show_form(step_id="init", data_schema=vol.Schema(schema))
