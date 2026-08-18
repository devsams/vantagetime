"""
VantageTime Orchestrator.

Full Phase 1-3 pipeline: Script Breakdown -> Scheduling (+ deterministic
validator tool) -> Location Research (parallel, one specialist per
script location) -> Call Sheet Generator. Frontend wiring and deploy are
still ahead — see PLAN.md at the repo root.
"""
from common.agents import build_production_pipeline

root_agent = build_production_pipeline()
