"""
VantageTime Roster Extractor.

The alternate "I have production data" entry point: a single agent that
reads an uploaded PDF/Word production document (casting list, crew list,
location list, production bible, previous call sheet, shooting schedule
— never a screenplay) and produces the same normalized people/locations
roster shape as the deterministic CSV importer (see
common/roster_import.py). A sibling ADK app to `orchestrator`, not a
stage inside it — a roster document has no scenes, so it has no business
running through the script-breakdown/scheduling pipeline.
"""
from common.agents import build_roster_extraction_agent

root_agent = build_roster_extraction_agent()
