"""Plain REST route for starting a production from an existing
spreadsheet (cast/crew/location list) instead of a script.

Deliberately deterministic, not an LLM agent: a spreadsheet is already
structured data, so this is just real parsing against one documented
template — same "never guess, only report a real problem" philosophy as
the rest of the app (see availability_routes.py's real date arithmetic).
CSV only for now; adding .xlsx later is a matter of swapping the parser
in `_parse_rows`, not changing this route's shape.
"""
import csv
import io
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/roster", tags=["roster"])

REQUIRED_HEADERS = {"name", "type"}
VALID_TYPES = {"actor", "crew", "location", "other"}


class RosterPerson(BaseModel):
    name: str
    type: str  # "actor" | "crew" | "other"
    role: str = ""
    location: str = ""
    availability_start: str = ""  # "YYYY-MM-DD", empty if blank or unparsable
    availability_end: str = ""
    email: str = ""
    priority: bool = False


class RosterLocation(BaseModel):
    name: str
    availability_start: str = ""
    availability_end: str = ""


class RosterImportResult(BaseModel):
    people: list[RosterPerson]
    locations: list[RosterLocation]
    # Row-level problems (bad type, bad date, missing name) — reported,
    # never silently dropped or guessed at, so the filmmaker knows
    # exactly what didn't make it in and can fix the spreadsheet.
    errors: list[str]


class RosterImportRequest(BaseModel):
    csv_text: str


def _norm_header(h: str) -> str:
    return h.strip().lower()


def _parse_bool(raw: str) -> bool:
    return raw.strip().lower() in {"yes", "y", "true", "1", "priority"}


def _parse_date(raw: str, row_num: int, col: str, errors: list[str]) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    try:
        date.fromisoformat(raw)
        return raw
    except ValueError:
        errors.append(f"Row {row_num}: {col} {raw!r} isn't a real date (expected YYYY-MM-DD) — left blank.")
        return ""


@router.post("/import", response_model=RosterImportResult)
def import_roster(req: RosterImportRequest) -> RosterImportResult:
    """Parses a documented CSV template: Name, Type, Role, Location,
    Availability Start, Availability End, Email, Priority. Type is one
    of Actor/Crew/Location/Other (case-insensitive). Column order
    doesn't matter, extra columns are ignored, and every row that can't
    be used comes back as a specific error rather than a silent skip."""
    reader = csv.DictReader(io.StringIO(req.csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Empty or unreadable CSV.")

    headers = {_norm_header(h): h for h in reader.fieldnames}
    missing = REQUIRED_HEADERS - set(headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required column(s): {', '.join(sorted(missing))}. "
                "Expected headers: Name, Type, Role, Location, Availability Start, "
                "Availability End, Email, Priority."
            ),
        )

    def get(row: dict, key: str) -> str:
        col = headers.get(key)
        return (row.get(col, "") or "").strip() if col else ""

    people: list[RosterPerson] = []
    locations: list[RosterLocation] = []
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # header is row 1
        name = get(row, "name")
        raw_type = get(row, "type").lower()
        if not name:
            errors.append(f"Row {i}: missing Name — skipped.")
            continue
        if raw_type not in VALID_TYPES:
            errors.append(
                f"Row {i}: {name!r} has type {get(row, 'type')!r}, expected one of "
                "Actor/Crew/Location/Other — skipped."
            )
            continue

        start = _parse_date(get(row, "availability start"), i, "Availability Start", errors)
        end = _parse_date(get(row, "availability end"), i, "Availability End", errors)
        if start and end and end < start:
            errors.append(
                f"Row {i}: {name!r}'s Availability End is before Availability Start — both left blank."
            )
            start, end = "", ""

        if raw_type == "location":
            locations.append(RosterLocation(name=name, availability_start=start, availability_end=end))
        else:
            people.append(
                RosterPerson(
                    name=name,
                    type=raw_type,
                    role=get(row, "role"),
                    location=get(row, "location"),
                    availability_start=start,
                    availability_end=end,
                    email=get(row, "email"),
                    priority=_parse_bool(get(row, "priority")),
                )
            )

    return RosterImportResult(people=people, locations=locations, errors=errors)
