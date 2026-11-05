"""Temperatures edited from the card: pure validation, no Home Assistant dependency."""
import math

MINIMUM, MAXIMUM = 5.0, 35.0
LABELS = {"night": "Nuit", "eco": "Éco", "comfort": "Confort"}


def _temperature(value, label):
    if isinstance(value, bool):
        raise ValueError(f"{label} : température invalide")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} : température invalide") from None
    if not math.isfinite(number) or not MINIMUM <= number <= MAXIMUM:
        raise ValueError(f"{label} : la température doit être entre 5 et 35 °C")
    return number


def apply_temperatures(options, profiles, away=None, boost=None, defaults=None):
    """Return a new options dict with updated profile, Absent and Boost temperatures.

    The profile *keys* are fixed by the integration (schedules and wakes refer to them),
    so only their values may change. Every other option is preserved unchanged.
    """
    current = dict(options.get("profiles", defaults or {}))
    if not isinstance(profiles, dict) or set(profiles) != set(current):
        names = ", ".join(LABELS.get(key, key) for key in current)
        raise ValueError(f"Températures attendues : {names}")
    result = dict(options)
    result["profiles"] = {key: _temperature(profiles[key], LABELS.get(key, key)) for key in current}
    if away is not None:
        result["away_temperature"] = _temperature(away, "Absent")
    if boost is not None:
        result["boost_temperature"] = _temperature(boost, "Boost")
    return result
