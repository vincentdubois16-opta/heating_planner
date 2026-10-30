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


def calculate(now: datetime, timezone: str, profiles: dict, weekly: dict, exceptions: dict | None = None) -> dict:
    """Return active profile/target and next *actual target* change (within 14 days)."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    tz = ZoneInfo(timezone)
    local_now = now.astimezone(tz)
    exceptions = exceptions or {}
    events = []
    for offset in range(-1, 16):
        day = local_now.date() + timedelta(days=offset)
        for wall, profile in _day_entries(day, weekly, exceptions):
            if profile not in profiles:
                raise ValueError(f"Unknown profile: {profile}")
            dt = _resolve_wall_time(day, wall, tz)
            events.append((dt.timestamp(), profile, float(profiles[profile])))
    events.sort(key=lambda event: event[0])
    now_ts = local_now.timestamp()
    past = [e for e in events if e[0] <= now_ts]
    if not past:
        raise ValueError("No current schedule entry")
    current = past[-1]
    upcoming = next((e for e in events if e[0] > now_ts and e[2] != current[2]), None)
    # Skip transitions between profiles with identical targets, while still
    # tracking the active temperature after each intermediate event.
    if upcoming is not None:
        effective = current[2]
        for e in events:
            if e[0] <= now_ts:
                continue
            if e[2] != effective:
                upcoming = e
                break
            effective = e[2]
    return {
        "profile": current[1],
        "target": current[2],
        "next_target": upcoming[2] if upcoming else None,
        "next_change": datetime.fromtimestamp(upcoming[0], tz) if upcoming else None,
    }
