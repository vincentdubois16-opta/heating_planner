"""Pure-Python, read-only schedule calculation; no Home Assistant dependency."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def _day_entries(day: date, weekly: dict, exceptions: dict):
    entries = exceptions.get(day.isoformat(), weekly.get(str(day.weekday())))
    if not entries:
        raise ValueError(f"Missing schedule for {day.isoformat()}")
    result = []
    for item in entries:
        hour, minute = map(int, item["time"].split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("Invalid schedule time")
        result.append((time(hour, minute), item["profile"]))
    result.sort(key=lambda item: item[0])
    if result[0][0] != time(0, 0) or len({t for t, _ in result}) != len(result):
        raise ValueError("Each day must start at 00:00 with unique times")
    return result


def _resolve_wall_time(day: date, wall: time, tz: ZoneInfo) -> datetime:
    """Choose first occurrence of ambiguous times; shift nonexistent times forward."""
    naive = datetime.combine(day, wall)
    for fold in (0, 1):
        aware = naive.replace(tzinfo=tz, fold=fold)
        roundtrip = aware.astimezone(ZoneInfo("UTC")).astimezone(tz)
        if roundtrip.replace(tzinfo=None) == naive:
            return aware
    # Spring DST gap: first valid instant after the gap.
    candidate = naive
    for _ in range(180):
        candidate += timedelta(minutes=1)
        aware = candidate.replace(tzinfo=tz)
        if aware.astimezone(ZoneInfo("UTC")).astimezone(tz).replace(tzinfo=None) == candidate:
            return aware
    raise ValueError("Could not resolve local schedule time")


class ScheduleTimeline:
    """One immutable schedule expansion, queried by time without rebuilding days."""
    def __init__(self, events, tz):
        self.events = tuple(events)
        self.stamps = tuple(event[0] for event in events)
        self.tz = tz
        upcoming = None
        next_different = [None] * len(events)
        for index in range(len(events)-2, -1, -1):
            if events[index][2] != events[index+1][2]:
                upcoming = index+1
            next_different[index] = upcoming
        self.next_different = tuple(next_different)

    def at(self, moment):
        from bisect import bisect_right
        index = bisect_right(self.stamps, moment.timestamp()) - 1
        if index < 0:
            raise ValueError("No current schedule entry")
        current = self.events[index]
        limit = datetime.combine(moment.astimezone(self.tz).date()+timedelta(days=16), time.min, self.tz).timestamp()
        next_index = self.next_different[index]
        upcoming = self.events[next_index] if next_index is not None and self.events[next_index][0] < limit else None
        return {"profile": current[1], "target": current[2],
                "next_target": upcoming[2] if upcoming else None,
                "next_change": datetime.fromtimestamp(upcoming[0], self.tz) if upcoming else None}

    def transitions(self, start, horizon):
        from bisect import bisect_right
        index = bisect_right(self.stamps, start.timestamp())
        before = self.events[max(0, index-1)][2]
        for stamp, _, after in self.events[index:]:
            if stamp > horizon.timestamp():
                break
            if after != before:
                yield datetime.fromtimestamp(stamp, self.tz), before, after
            before = after


def build_timeline(now, timezone, profiles, weekly, exceptions=None, wakes=None, zone=None, extra_moments=()):
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    tz = ZoneInfo(timezone)
    exceptions = exceptions or {}
    # A distant override expiry needs its own window, not every intervening day.
    days = sorted({moment.astimezone(tz).date()+timedelta(days=offset)
                   for moment in (now, *extra_moments) for offset in range(-1, 17)})
    events = []
    for day in days:
        for wall, profile in _day_entries(day, weekly, exceptions):
            if profile not in profiles:
                raise ValueError(f"Unknown profile: {profile}")
            dt = _resolve_wall_time(day, wall, tz)
            events.append((dt.timestamp(), profile, float(profiles[profile])))
    # Overlay wake windows over the normal schedule; date exceptions are the base.
    # Wake events have priority. When a wake ends, restore the underlying schedule.
    if wakes and zone:
        from .wake_engine import wake_intervals
        intervals = []
        for day in days:
            intervals.extend(wake_intervals(wakes, zone, profiles, day, timezone))
        boundaries = {e[0] for e in events}
        for start, end, _, _ in intervals:
            boundaries.add(start)
            boundaries.add(end)
        base = sorted(events, key=lambda e: e[0])
        merged = []
        for stamp in sorted(boundaries):
            underlying = next((e for e in reversed(base) if e[0] <= stamp), None)
            if underlying is None:
                continue
            active = [i for i in intervals if i[0] <= stamp < i[1]]
            # Deterministic conflict handling: latest starting wake takes precedence.
            selected = max(active, key=lambda i: (i[0], i[1])) if active else None
            merged.append((stamp, selected[2], selected[3]) if selected else (stamp, underlying[1], underlying[2]))
        events = merged
    events.sort(key=lambda event: event[0])
    return ScheduleTimeline(events, tz)


def calculate(now, timezone, profiles, weekly, exceptions=None, wakes=None, zone=None):
    return build_timeline(now, timezone, profiles, weekly, exceptions, wakes, zone).at(now)


def validate_schedule(weekly: dict, profiles: dict) -> dict:
    """Validate all seven days and return a normalized, safe copy."""
    if not isinstance(weekly, dict) or set(weekly) != {str(i) for i in range(7)}:
        raise ValueError("Le planning doit contenir les sept jours (0 à 6)")
    clean = {}
    for day in range(7):
        entries = weekly[str(day)]
        if not isinstance(entries, list) or not 1 <= len(entries) <= 48:
            raise ValueError(f"Jour {day}: 1 à 48 plages attendues")
        cleaned = []
        seen = set()
        for item in entries:
            if not isinstance(item, dict) or set(item) != {"time", "profile"}:
                raise ValueError(f"Jour {day}: entrée invalide")
            value = item["time"]
            if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
                raise ValueError(f"Jour {day}: heure invalide")
            try:
                hh, mm = (int(part) for part in value.split(":"))
            except ValueError as exc:
                raise ValueError(f"Jour {day}: heure invalide") from exc
            if not (0 <= hh < 24 and 0 <= mm < 60) or f"{hh:02d}:{mm:02d}" != value:
                raise ValueError(f"Jour {day}: heure invalide")
            if value in seen:
                raise ValueError(f"Jour {day}: heures en double")
            seen.add(value)
            if item["profile"] not in profiles:
                raise ValueError(f"Jour {day}: profil inconnu")
            cleaned.append({"time": value, "profile": item["profile"]})
        cleaned.sort(key=lambda e: e["time"])
        if cleaned[0]["time"] != "00:00":
            raise ValueError(f"Jour {day}: première plage obligatoire à 00:00")
        clean[str(day)] = cleaned
    return clean


def validate_exceptions(exceptions: dict, profiles: dict) -> dict:
    """Validate date-specific complete day schedules; empty dict clears overrides."""
    if not isinstance(exceptions, dict) or len(exceptions) > 366:
        raise ValueError("Maximum 366 dates d'exception")
    clean = {}
    for iso, entries in exceptions.items():
        if not isinstance(iso, str):
            raise ValueError("Date invalide")
        try:
            day = date.fromisoformat(iso)
        except ValueError as exc:
            raise ValueError(f"Date invalide : {iso}") from exc
        if day.isoformat() != iso:
            raise ValueError(f"Date non canonique : {iso}")
        # Reuse the exact weekly day validator for each dated override.
        probe = {str(i): entries for i in range(7)}
        clean[iso] = validate_schedule(probe, profiles)["0"]
    return dict(sorted(clean.items()))
