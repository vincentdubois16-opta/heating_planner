"""UI setup for a single isolated demo instance."""
import voluptuous as vol
from homeassistant import config_entries
from .const import DOMAIN, DEFAULT_NAME


class HeatingPlannerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id("demo_max_bedroom")
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("name", default=DEFAULT_NAME): str}),
        )
