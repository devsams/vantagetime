"""Factory functions for VantageTime's production pipeline.

Factories (not shared instances) because ADK agents can only belong to
one parent — a standalone test app and the orchestrator would each need
their own copy of the same agent. Also true of the location research
slots: each parallel instance needs its own Agent object even though
they share an instruction template.
"""
from google.adk.agents import Agent, ParallelAgent, SequentialAgent

from .instructions import (
    AVAILABILITY_INSTRUCTION,
    CALL_SHEET_INSTRUCTION,
    LOCATION_RESEARCH_DESCRIPTION,
    ROSTER_EXTRACTION_INSTRUCTION,
    SCHEDULING_INSTRUCTION,
    SCRIPT_BREAKDOWN_INSTRUCTION,
    location_research_instruction,
)
from .model_config import RESILIENT_CONFIG
from .tools import (
    assign_calendar_dates,
    estimate_cast_hours,
    get_weather,
    search_location,
    validate_schedule,
)

MODEL = "gemini-2.5-flash"

# Fixed number of parallel location-research slots. ADK agent trees are
# built once at process start, so we can't spawn "one agent per location"
# dynamically per script — instead we run a fixed pool and each slot
# picks up the Nth location (or sits idle if the script has fewer).
# 5 covers the vast majority of short-film/ultra-low-budget scripts this
# product targets; a script with more distinct locations just leaves the
# excess unresearched for now (a > 5-location shoot on this budget tier
# is unusual, and a real limit is easy to raise later).
LOCATION_SLOTS = 5

SCRIPT_BREAKDOWN_DESCRIPTION = (
    "Reads an uploaded screenplay PDF and produces a structured "
    "breakdown — scenes, cast, locations, and per-scene production "
    "flags (stunts, VFX, night exteriors, etc.). Every later pipeline "
    "stage (Scheduling, Location Research, Call Sheet) builds on this "
    "breakdown rather than re-reading the script."
)

SCHEDULING_DESCRIPTION = (
    "Proposes a shoot schedule from the script breakdown — grouping "
    "scenes into shoot days by location and time of day — then checks "
    "it with a deterministic Python validator (cast/scene double-"
    "booking, page-count-per-day budget, location jumps, magic-hour "
    "conflicts) rather than trusting its own arithmetic. When given a "
    "real shoot window, assigns real calendar dates via a deterministic "
    "date tool and pulls a live forecast or real historical weather "
    "average per shoot day from a live weather API. Also computes real "
    "per-role hours-needed for every shoot day from each cast member's "
    "share of that day's pages."
)

CALL_SHEET_DESCRIPTION = (
    "Synthesizes the breakdown, validated schedule, and location "
    "research into one call sheet per shoot day — never re-deriving "
    "facts the earlier stages already established, and flagging "
    "anything it can't fill in rather than guessing."
)

AVAILABILITY_DESCRIPTION = (
    "Drafts a personal availability-request message for each cast "
    "member listing their specific scheduled days, real dates (once "
    "set), and real hours-needed per day. Drafting only — token "
    "generation, magic links, sending, and tracking actor responses are "
    "deterministic backend work, not this agent's job."
)

PRODUCTION_PIPELINE_DESCRIPTION = (
    "Turns an uploaded screenplay into production-ready call sheets and "
    "cast outreach: Script Breakdown Agent extracts scenes/cast/"
    "locations, a parallel team of Location Research Agents (one per "
    "script location) researches permits/weather/logistics via live web "
    "search, Scheduling Agent groups scenes into shoot days, validates "
    "the result with real arithmetic, and — given a real shoot window — "
    "assigns real calendar dates and pulls live forecasts or real "
    "historical weather averages per day, the Call Sheet Generator "
    "synthesizes it all into per-day call sheets, and the Availability "
    "Agent drafts per-actor outreach for the validated schedule."
)


def build_script_breakdown_agent() -> Agent:
    return Agent(
        model=MODEL,
        name="script_breakdown_agent",
        description=SCRIPT_BREAKDOWN_DESCRIPTION,
        instruction=SCRIPT_BREAKDOWN_INSTRUCTION,
        output_key="breakdown",
        generate_content_config=RESILIENT_CONFIG,
    )


ROSTER_EXTRACTION_DESCRIPTION = (
    "Reads an uploaded production-data document (casting list, crew "
    "list, location list, production bible, previous call sheet, or "
    "shooting schedule — PDF, Word, or a messier/mixed-layout CSV that "
    "the deterministic importer couldn't parse — never a screenplay) "
    "and produces the same normalized people/locations roster shape the "
    "deterministic CSV importer produces, so a production can start "
    "from whatever document it already has instead of a script."
)


def build_roster_extraction_agent() -> Agent:
    return Agent(
        model=MODEL,
        name="roster_extraction_agent",
        description=ROSTER_EXTRACTION_DESCRIPTION,
        instruction=ROSTER_EXTRACTION_INSTRUCTION,
        output_key="roster",
        generate_content_config=RESILIENT_CONFIG,
    )


def build_scheduling_agent() -> Agent:
    return Agent(
        model=MODEL,
        name="scheduling_agent",
        description=SCHEDULING_DESCRIPTION,
        instruction=SCHEDULING_INSTRUCTION,
        tools=[validate_schedule, assign_calendar_dates, get_weather, estimate_cast_hours],
        output_key="schedule",
        generate_content_config=RESILIENT_CONFIG,
    )


def _build_location_research_agent(slot_index: int) -> Agent:
    return Agent(
        model=MODEL,
        name=f"location_research_agent_{slot_index}",
        description=LOCATION_RESEARCH_DESCRIPTION,
        instruction=location_research_instruction(slot_index, LOCATION_SLOTS),
        tools=[search_location],
        output_key=f"location_research_{slot_index}",
        generate_content_config=RESILIENT_CONFIG,
    )


def build_location_research_pipeline() -> ParallelAgent:
    return ParallelAgent(
        name="location_research_pipeline",
        description=(
            "Runs one location-research specialist per script location, "
            "in parallel, up to "
            f"{LOCATION_SLOTS} locations."
        ),
        sub_agents=[
            _build_location_research_agent(i) for i in range(1, LOCATION_SLOTS + 1)
        ],
    )


def build_call_sheet_generator() -> Agent:
    return Agent(
        model=MODEL,
        name="call_sheet_generator",
        description=CALL_SHEET_DESCRIPTION,
        instruction=CALL_SHEET_INSTRUCTION,
        output_key="call_sheets",
        generate_content_config=RESILIENT_CONFIG,
    )


def build_availability_agent() -> Agent:
    return Agent(
        model=MODEL,
        name="availability_agent",
        description=AVAILABILITY_DESCRIPTION,
        instruction=AVAILABILITY_INSTRUCTION,
        output_key="cast_outreach",
        generate_content_config=RESILIENT_CONFIG,
    )


def build_production_pipeline() -> SequentialAgent:
    """Script Breakdown -> Location Research -> Scheduling (+ validator +
    calendar dates, using the location research for weather flags) ->
    Call Sheet -> Availability.

    Location Research only depends on breakdown (which locations exist),
    not on the schedule, so it's safe to run before Scheduling — and
    doing so lets Scheduling read real seasonal/weather notes when it
    assigns calendar dates, instead of running blind.
    """
    return SequentialAgent(
        name="production_pipeline",
        description=PRODUCTION_PIPELINE_DESCRIPTION,
        sub_agents=[
            build_script_breakdown_agent(),
            build_location_research_pipeline(),
            build_scheduling_agent(),
            build_call_sheet_generator(),
            build_availability_agent(),
        ],
    )
