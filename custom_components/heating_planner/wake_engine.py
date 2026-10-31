"""Wake events: shared event definitions with zone-specific profile selections."""
from datetime import date, datetime, timedelta
from .schedule_engine import _resolve_wall_time
from zoneinfo import ZoneInfo


def validate_wakes(events, profiles_by_zone):
    if not isinstance(events, list) or len(events) > 40:
        raise ValueError('Maximum 40 réveils')
    clean = []
    ids = set()
    for event in events:
        if not isinstance(event, dict):
            raise ValueError('Réveil invalide')
        ident = event.get('id')
        if not isinstance(ident, str) or not ident or len(ident) > 60 or ident in ids:
            raise ValueError('Identifiant de réveil invalide ou en double')
        ids.add(ident)
        name = event.get('name', '')
        if not isinstance(name, str) or not 1 <= len(name) <= 80:
            raise ValueError('Nom de réveil invalide')
        times = event.get('times', {})
        if not isinstance(times, dict) or set(times) != {str(i) for i in range(7)}:
            raise ValueError('Sept horaires de réveil requis')
        normalized = {}
        for day, slot in times.items():
            normalized[day] = _slot(slot)
        overrides = event.get('dates', {})
        if not isinstance(overrides, dict) or len(overrides) > 366:
            raise ValueError('Dates de réveil invalides')
        dates = {}
        for day, slot in overrides.items():
            try:
                if date.fromisoformat(day).isoformat() != day:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ValueError('Date de réveil invalide') from None
            dates[day] = _slot(slot)
        zones = event.get('zones', {})
        if not isinstance(zones, dict) or not zones:
            raise ValueError('Sélectionner au moins une zone')
        for zone, profile in zones.items():
            if zone not in profiles_by_zone or profile not in profiles_by_zone[zone]:
                raise ValueError('Zone ou profil de réveil inconnu')
        clean.append({'id': ident, 'name': name, 'times': normalized, 'dates': dates, 'zones': dict(zones)})
    return clean


def _slot(slot):
    if slot is None:
        return None
    if not isinstance(slot, dict) or set(slot) != {'start', 'end'}:
        raise ValueError('Plage de réveil invalide')
    for value in slot.values():
        if not isinstance(value, str) or len(value) != 5 or value[2] != ':':
            raise ValueError('Heure de réveil invalide')
        try:
            h, m = map(int, value.split(':'))
        except ValueError:
            raise ValueError('Heure de réveil invalide') from None
        if not (0 <= h <= 23 and 0 <= m <= 59 and value == f'{h:02d}:{m:02d}'):
            raise ValueError('Heure de réveil invalide')
    if slot['start'] >= slot['end']:
        raise ValueError('Le réveil doit se terminer après son début (même jour)')
    return dict(slot)


def wake_intervals(events, zone, profiles, local_day, timezone):
    """Return (start_timestamp, end_timestamp, profile, temperature) for a day."""
    tz = ZoneInfo(timezone)
    output = []
    for event in events:
        profile = event['zones'].get(zone)
        if profile is None:
            continue
        slot = event['dates'].get(local_day.isoformat(), event['times'][str(local_day.weekday())])
        if slot is None:
            continue
        from datetime import time
        start = _resolve_wall_time(local_day, time.fromisoformat(slot['start']), tz)
        end = _resolve_wall_time(local_day, time.fromisoformat(slot['end']), tz)
        output.append((start.timestamp(), end.timestamp(), profile, float(profiles[profile])))
    return output
