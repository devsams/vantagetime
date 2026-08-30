"""Shared tools for VantageTime's agents."""
import os
from datetime import date, timedelta

import requests
from parallel import Parallel


def search_location(objective: str, queries: list[str]) -> dict:
    """Searches the live web for real-world film production logistics —
    permit requirements, weather norms, and shooting considerations for a
    specific city/region. Use this whenever you need up-to-date facts you
    couldn't reliably know from memory alone; never guess at permit rules
    or seasonal weather.

    Args:
        objective: A one-sentence research brief (e.g. "Find film permit
            requirements and typical weather for exterior shoots in
            Austin, TX in October").
        queries: 3-5 specific search queries a location scout would
            actually type, each covering a different angle (permits,
            weather, general logistics, nearest hospital/emergency
            contacts, and — for a public location — operating hours).

    Returns:
        A dict with a "results" list. Each item has "title", "url", and
        "excerpts" — the real text snippets your answer must be based on.
    """
    client = Parallel(api_key=os.environ["PARALLEL_API_KEY"])
    try:
        search = client.search(objective=objective, search_queries=queries)
    except Exception as e:
        return {"results": [], "error": f"Search failed: {e}"}

    results = [
        {"title": r.title, "url": r.url, "excerpts": r.excerpts}
        for r in search.results
        if r.excerpts
    ]
    return {"results": results, "result_count": len(results)}


# Documented assumption, not tunable by the LLM — a small/low-budget crew
# rule of thumb, not a union-crew SAG day rate. Keeps the same schedule
# always producing the same validation result under the same inputs.
_MAX_PAGES_PER_DAY = 5.0


def validate_schedule(schedule_days: list[dict], scenes: list[dict]) -> dict:
    """Checks a proposed shoot schedule with real arithmetic — never
    LLM-estimated. This is the only source of truth for whether a
    schedule is realistic; do not recompute, adjust, or override its
    output, and always copy its "issues" and "day_summaries" verbatim
    into your final answer.

    Args:
        schedule_days: List of {"day_number": int, "scene_numbers":
            [int, ...]} — your proposed grouping of scenes into shoot
            days. Every scene number must come from the breakdown.
        scenes: List of {"number": int, "page_count": number,
            "location": str, "flags": [str]} — copied directly from the
            breakdown's "scenes" array (only these four fields needed).

    Returns:
        A dict with "valid" (bool, true only if there are no "error"
        severity issues), "issues" (list of {"severity": "error"|
        "warning", "day_number": int|null, "message": str}), and
        "day_summaries" (per-day {"day_number", "total_pages",
        "locations", "magic_hour_count"}).
    """
    scene_lookup = {s.get("number"): s for s in scenes or []}
    scheduled_numbers: set = set()
    issues: list[dict] = []
    day_summaries: list[dict] = []

    for day in schedule_days or []:
        day_number = day.get("day_number")
        scene_numbers = day.get("scene_numbers") or []
        total_pages = 0.0
        locations: set = set()
        magic_hour_scenes: list[int] = []

        for n in scene_numbers:
            if n in scheduled_numbers:
                issues.append(
                    {
                        "severity": "error",
                        "day_number": day_number,
                        "message": f"Scene {n} is scheduled on more than one day.",
                    }
                )
            scheduled_numbers.add(n)

            s = scene_lookup.get(n)
            if not s:
                issues.append(
                    {
                        "severity": "error",
                        "day_number": day_number,
                        "message": f"Scene {n} does not exist in the breakdown.",
                    }
                )
                continue

            page_count = s.get("page_count")
            if isinstance(page_count, (int, float)):
                total_pages += page_count
            loc = s.get("location")
            if loc:
                locations.add(loc)
            flags = s.get("flags") or []
            if "magic_hour" in flags:
                magic_hour_scenes.append(n)

        if total_pages > _MAX_PAGES_PER_DAY:
            issues.append(
                {
                    "severity": "warning",
                    "day_number": day_number,
                    "message": (
                        f"Day {day_number} is scheduled for {round(total_pages, 1)} "
                        f"pages — above the {_MAX_PAGES_PER_DAY}-page/day rule of "
                        "thumb for a small crew."
                    ),
                }
            )
        if len(locations) >= 3:
            # Hard rule, not just a heads-up: a small/no-budget crew with
            # no production vehicle can't reliably company-move more than
            # once in a day. The Scheduling Agent's own instruction
            # already claims this is a "never" rule — this is what
            # actually enforces it, same as every other real constraint
            # here, instead of relying on the agent to police itself.
            issues.append(
                {
                    "severity": "error",
                    "day_number": day_number,
                    "message": (
                        f"Day {day_number} spans {len(locations)} locations "
                        f"({', '.join(sorted(locations))}) — a shoot day "
                        "should never cover 3 or more distinct locations. "
                        "Split across more days."
                    ),
                }
            )
        elif len(locations) > 1:
            issues.append(
                {
                    "severity": "warning",
                    "day_number": day_number,
                    "message": (
                        f"Day {day_number} spans {len(locations)} locations "
                        f"({', '.join(sorted(locations))}) — factor in travel/"
                        "company move time, or split across two days."
                    ),
                }
            )
        if len(magic_hour_scenes) > 1:
            issues.append(
                {
                    "severity": "warning",
                    "day_number": day_number,
                    "message": (
                        f"Day {day_number} has {len(magic_hour_scenes)} magic-hour "
                        f"scenes ({magic_hour_scenes}) — there's only one golden-"
                        "hour window per day, so at most one of these will get "
                        "true magic-hour light."
                    ),
                }
            )

        day_summaries.append(
            {
                "day_number": day_number,
                "total_pages": round(total_pages, 1),
                "locations": sorted(locations),
                "magic_hour_count": len(magic_hour_scenes),
            }
        )

    all_numbers = {s.get("number") for s in scenes or []}
    missing = sorted(n for n in (all_numbers - scheduled_numbers) if n is not None)
    if missing:
        issues.append(
            {
                "severity": "error",
                "day_number": None,
                "message": f"Scenes not scheduled on any day: {missing}",
            }
        )

    valid = not any(i["severity"] == "error" for i in issues)
    return {
        "valid": valid,
        "issues": issues,
        "day_summaries": day_summaries,
        "shoot_days": len(schedule_days or []),
    }


def assign_calendar_dates(shoot_days: list[dict], start_date: str, end_date: str) -> dict:
    """Assigns real calendar dates to an already-validated shoot schedule,
    in order, using real date arithmetic — never LLM-estimated. This is
    the only source of truth for shoot dates; do not recompute, adjust,
    or invent a date yourself.

    Args:
        shoot_days: The validated schedule's days, in shoot order. Only
            needs {"day_number": int} per entry — extra fields are ignored.
        start_date: "YYYY-MM-DD" — the first day of the shoot window,
            exactly as given by the filmmaker (a SHOOT_WINDOW message).
        end_date: "YYYY-MM-DD" — the last day of the window, inclusive.

    Returns:
        A dict with "dates" ([{"day_number", "date"}], one per shoot
        day, in order) and "error" (a string explaining why if the
        window doesn't have enough days for the number of shoot days
        needed, or the dates were malformed — otherwise null).
    """
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except (ValueError, TypeError):
        return {
            "dates": [],
            "error": (
                f"Invalid date format — expected YYYY-MM-DD, got "
                f"start_date={start_date!r} end_date={end_date!r}"
            ),
        }

    if end < start:
        return {"dates": [], "error": "end_date is before start_date."}

    window_days = (end - start).days + 1
    needed = len(shoot_days or [])
    if needed > window_days:
        return {
            "dates": [],
            "error": (
                f"The shoot window is {window_days} day(s) long but the "
                f"schedule needs {needed} shoot day(s) — pick a longer "
                "window or reduce the number of shoot days."
            ),
        }

    dates = [
        {"day_number": d.get("day_number"), "date": (start + timedelta(days=i)).isoformat()}
        for i, d in enumerate(shoot_days or [])
    ]
    return {"dates": dates, "error": None}


# Standard low-budget shoot day length and a floor so a single-scene day
# player never shows as a near-zero call — both plain documented
# assumptions, not tunable by the LLM, so the same day always produces
# the same hours breakdown.
_DEFAULT_SHOOT_HOURS = 10.0
_MIN_CALL_HOURS = 2.0


def estimate_cast_hours(scenes: list[dict], total_shoot_hours: float = _DEFAULT_SHOOT_HOURS) -> dict:
    """Estimates how many hours each cast member is actually needed on a
    single shoot day — real arithmetic, never LLM-estimated. Each
    person's hours are their share of that day's total pages (how much
    of the day their scenes take up), floored at a minimum call and
    capped at the full day length. This is the only source of truth for
    per-role hours; do not recompute, adjust, or invent one yourself.

    Args:
        scenes: That day's scheduled scenes only, each {"number": int,
            "page_count": number, "characters": [string]} — copied
            directly from breakdown.scenes for the scene numbers on this
            day (only these three fields needed).
        total_shoot_hours: The full shoot day length in hours. Default
            10 (a standard low-budget shoot day) — pass a different
            number only if the production has explicitly stated a
            different day length somewhere in the conversation.

    Returns:
        A dict with "total_shoot_hours" and "cast_hours" ([{"name":
        string, "hours_needed": number}], one entry per character
        appearing in any of the day's scenes, hours_needed rounded to
        the nearest 0.5).
    """
    total_pages = sum(
        s.get("page_count", 0) for s in scenes or [] if isinstance(s.get("page_count"), (int, float))
    )

    char_pages: dict[str, float] = {}
    for s in scenes or []:
        page_count = s.get("page_count")
        if not isinstance(page_count, (int, float)):
            page_count = 0
        for name in s.get("characters") or []:
            char_pages[name] = char_pages.get(name, 0) + page_count

    cast_hours = []
    for name, pages in char_pages.items():
        share = (pages / total_pages) if total_pages > 0 else 0
        hours = max(_MIN_CALL_HOURS, round(share * total_shoot_hours * 2) / 2)
        hours = min(hours, total_shoot_hours)
        cast_hours.append({"name": name, "hours_needed": hours})

    return {"total_shoot_hours": total_shoot_hours, "cast_hours": cast_hours}


# Open-Meteo — free, no API key required. Forecast API covers ~16 days
# out; beyond that there's no real forecast to have, so we fall back to
# real historical daily records for the same calendar date across the
# last few years and report a genuine statistical average instead of
# ever guessing.
_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
_FORECAST_HORIZON_DAYS = 15
_HISTORICAL_YEARS_SAMPLED = 5


def get_weather(place: str, target_date: str) -> dict:
    """Gets REAL weather data for a specific real-world place and date —
    never LLM-estimated. Returns a live forecast if the date is within
    about two weeks; otherwise returns a genuine statistical average
    computed from the last few years of actual historical records for
    that same calendar date (not a guess, real archived measurements).

    Args:
        place: A real-world, geocodable place name — as specific as
            possible, e.g. "Zilker Park, Austin, TX" or "Austin, TX".
            Never pass a fictional script location name alone.
        target_date: "YYYY-MM-DD" — normally a date already assigned by
            assign_calendar_dates.

    Returns:
        On success: {"resolved_place", "mode" ("forecast" or
        "historical_average"), "date", "sunrise", "sunset" (both
        "HH:MM" local time, real astronomical data — empty string only
        if the API didn't return them), plus either forecast fields
        (temp_max_f, temp_min_f, precipitation_probability_pct) or
        historical fields (avg_temp_max_f, avg_temp_min_f,
        rainy_day_pct, years_sampled — "sunrise"/"sunset" in this mode
        are from the most recent sampled year, which is accurate to
        within a minute of the real target date since sunrise/sunset "
        for a given calendar day barely shifts year to year). Returns
        {"error": ...} if the place can't be geocoded, the date is
        invalid, or no real data was available — never fill in a guess
        instead.
    """
    try:
        target = date.fromisoformat(target_date)
    except (ValueError, TypeError):
        return {"error": f"Invalid date: {target_date!r}"}

    try:
        geo_res = requests.get(_GEOCODE_URL, params={"name": place, "count": 1}, timeout=10)
        geo_res.raise_for_status()
        results = geo_res.json().get("results") or []
    except Exception as e:
        return {"error": f"Geocoding request failed: {e}"}

    if not results:
        return {"error": f"Could not find a real-world location matching {place!r}."}

    top = results[0]
    lat, lon = top["latitude"], top["longitude"]
    resolved_place = ", ".join(
        p for p in [top.get("name"), top.get("admin1"), top.get("country")] if p
    )

    days_out = (target - date.today()).days

    if 0 <= days_out <= _FORECAST_HORIZON_DAYS:
        try:
            res = requests.get(
                _FORECAST_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
                    "temperature_unit": "fahrenheit",
                    "timezone": "auto",
                    "start_date": target_date,
                    "end_date": target_date,
                },
                timeout=10,
            )
            res.raise_for_status()
            daily = res.json().get("daily") or {}
            if not daily.get("time"):
                return {"error": "Forecast API returned no data for this date."}
            return {
                "resolved_place": resolved_place,
                "mode": "forecast",
                "date": target_date,
                "temp_max_f": daily["temperature_2m_max"][0],
                "temp_min_f": daily["temperature_2m_min"][0],
                "precipitation_probability_pct": daily["precipitation_probability_max"][0],
                "sunrise": _extract_time(daily.get("sunrise")),
                "sunset": _extract_time(daily.get("sunset")),
            }
        except Exception as e:
            return {"error": f"Forecast request failed: {e}"}

    samples = []
    sun_sample = {"sunrise": "", "sunset": ""}
    for years_back in range(1, _HISTORICAL_YEARS_SAMPLED + 1):
        try:
            hist_date = target.replace(year=target.year - years_back)
        except ValueError:
            continue  # e.g. Feb 29 with no leap year that far back
        try:
            res = requests.get(
                _ARCHIVE_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset",
                    "temperature_unit": "fahrenheit",
                    "timezone": "auto",
                    "start_date": hist_date.isoformat(),
                    "end_date": hist_date.isoformat(),
                },
                timeout=10,
            )
            res.raise_for_status()
            daily = res.json().get("daily") or {}
            if daily.get("time"):
                samples.append(
                    {
                        "temp_max_f": daily["temperature_2m_max"][0],
                        "temp_min_f": daily["temperature_2m_min"][0],
                        "precip_in": daily["precipitation_sum"][0] or 0,
                    }
                )
                # Sunrise/sunset barely shift year to year for the same
                # calendar date — the most recent successfully-sampled
                # year is close enough to real for a call sheet, and
                # far better than guessing.
                if not sun_sample["sunrise"] and daily.get("sunrise"):
                    sun_sample["sunrise"] = _extract_time(daily.get("sunrise"))
                    sun_sample["sunset"] = _extract_time(daily.get("sunset"))
        except Exception:
            continue  # one bad year shouldn't sink the whole average

    if not samples:
        return {"error": "No real historical weather records were available for this date."}

    rainy_days = sum(1 for s in samples if s["precip_in"] > 0.1)
    return {
        "resolved_place": resolved_place,
        "mode": "historical_average",
        "date": target_date,
        "avg_temp_max_f": round(sum(s["temp_max_f"] for s in samples) / len(samples), 1),
        "avg_temp_min_f": round(sum(s["temp_min_f"] for s in samples) / len(samples), 1),
        "rainy_day_pct": round(100 * rainy_days / len(samples)),
        "years_sampled": len(samples),
        "sunrise": sun_sample["sunrise"],
        "sunset": sun_sample["sunset"],
    }


def _extract_time(values: list | None) -> str:
    """Open-Meteo returns sunrise/sunset as ISO datetimes like
    "2026-08-18T06:22" (local time, since timezone="auto"). Pulls just
    the "HH:MM" — real data passthrough, not a computation."""
    if not values:
        return ""
    first = values[0]
    if not first or "T" not in first:
        return ""
    return first.split("T", 1)[1]
