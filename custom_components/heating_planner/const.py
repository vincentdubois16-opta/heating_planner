DOMAIN = "heating_planner"
DEFAULT_NAME = "Chambre Max (démo)"
DEFAULT_PROFILES = {"night": 17.0, "eco": 18.0, "comfort": 21.0}
# Demonstration only. Each day has a starting profile at midnight.
WEEKDAY = [
    {"time": "00:00", "profile": "night"},
    {"time": "07:00", "profile": "comfort"},
    {"time": "08:30", "profile": "eco"},
    {"time": "19:00", "profile": "comfort"},
    {"time": "22:30", "profile": "night"},
]
WEEKEND = [
    {"time": "00:00", "profile": "night"},
    {"time": "09:00", "profile": "comfort"},
    {"time": "11:00", "profile": "eco"},
    {"time": "19:00", "profile": "comfort"},
    {"time": "23:00", "profile": "night"},
]
DEFAULT_SCHEDULE = {str(day): (WEEKDAY if day < 5 else WEEKEND) for day in range(7)}
