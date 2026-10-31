"""Temporary per-zone setpoint override, without actuator control."""
from datetime import datetime, timedelta, timezone

MODES = ('planning', 'manual', 'boost', 'away')

def validate_override(value, now):
    if not isinstance(value, dict):
        raise ValueError('Mode invalide')
    mode = value.get('mode')
    if mode not in MODES:
        raise ValueError('Mode inconnu')
    if mode == 'planning':
        return {'mode': 'planning'}
    try:
        target = float(value['temperature'])
        until = datetime.fromisoformat(value['until'])
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise ValueError('Température ou échéance invalide') from exc
    if not 5 <= target <= 35:
        raise ValueError('Température hors limites (5 à 35 °C)')
    if until.tzinfo is None or until.utcoffset() is None:
        raise ValueError('Échéance avec fuseau horaire obligatoire')
    until = until.astimezone(timezone.utc)
    if not now < until <= now + timedelta(days=365):
        raise ValueError('Échéance future requise (maximum 365 jours)')
    return {'mode': mode, 'temperature': target, 'until': until.isoformat()}

def apply_override(base, override, now):
    result = dict(base)
    result.update(active_mode='planning', override_until=None)
    if not isinstance(override, dict) or override.get('mode') not in MODES[1:]:
        return result
    try:
        until = datetime.fromisoformat(override['until'])
        if until.tzinfo is None or until <= now:
            return result
        target = float(override['temperature'])
    except (KeyError, TypeError, ValueError):
        return result
    result.update(active_mode=override['mode'], override_until=until,
                  target=target, preheat_active=False, preheat_start=None,
                  preheat_target=None)
    # After expiry, return to the *effective* planner target, including preheat.
    # Caller passes a function to compute that value at the expiry instant.
    return result
