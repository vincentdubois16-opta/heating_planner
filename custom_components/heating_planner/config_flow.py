"""Heating Planner configuration and per-zone profile options."""
import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN, DEFAULT_NAME, DEFAULT_PROFILES


class HeatingPlannerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        # Keep the original preview's identity to support an in-place update.
        await self.async_set_unique_id("demo_max_bedroom")
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("name", default=DEFAULT_NAME): str}),
        )

    @staticmethod
    def async_get_options_flow(config_entry):
        return HeatingPlannerOptionsFlow()


class HeatingPlannerOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data={
                "profiles": {k: float(user_input[k]) for k in DEFAULT_PROFILES}
            })
        existing = self.config_entry.options.get("profiles", DEFAULT_PROFILES)
        schema = {
            vol.Required(key, default=float(existing.get(key, value))):
                vol.All(vol.Coerce(float), vol.Range(min=5, max=35))
            for key, value in DEFAULT_PROFILES.items()
        }
        return self.async_show_form(step_id="init", data_schema=vol.Schema(schema))
