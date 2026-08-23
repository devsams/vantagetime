"""Plain REST route backing the right-rail chat "command center."

Deliberately NOT an ADK agent/app: this is one Gemini call per message,
given a compact snapshot of the current project as context plus a small
fixed set of callable actions (rename/add/update/remove cast & crew, set
the shoot window). No agentic loop, no server-side session, no tool
execution here — the actual project state lives in the frontend's
localStorage, not on this backend, so the model's function calls are
just relayed back as data; the frontend executes them against the exact
same update functions the UI's own edit controls already use (see
page.tsx's applyChatAction). That keeps this endpoint simple and means
a chat-driven edit and a manual UI edit can never diverge in behavior.
"""
import logging

from fastapi import APIRouter
from google import genai
from google.genai import types
from pydantic import BaseModel

from .model_config import RESILIENT_CONFIG

logger = logging.getLogger("vantagetime.chat")

# Deliberately not "/chat" — that path is a common ad/privacy-blocker
# filter-list target (chat widgets, trackers), and a blocked request
# shows up in the browser as an opaque "Failed to fetch" with no CORS
# error and no obvious cause. "/assistant" avoids the collision.
router = APIRouter(prefix="/assistant", tags=["assistant"])

MODEL = "gemini-2.5-flash"


class ChatTurn(BaseModel):
    role: str  # "user" | "model"
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatTurn] = []
    # A compact, frontend-built snapshot of the active project — not the
    # full Project object. See frontend/src/lib/chatContext.ts for the
    # exact shape. Kept loosely typed here (plain dict) since this is
    # just context for the prompt, never parsed/validated structurally.
    project: dict = {}


class ChatAction(BaseModel):
    name: str
    args: dict


class ChatResponse(BaseModel):
    reply: str
    actions: list[ChatAction]


# --- Callable actions -------------------------------------------------
# Every action here has a corresponding handler already wired up in the
# frontend (page.tsx) for the UI's own edit controls — this list is
# deliberately just those, not a broader surface, per the "wire the chat
# to existing update functions" scope.

_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="rename_cast_member",
                description="Renames a cast member. Use when the user wants to correct a "
                "misspelled name or replace one actor with another under the same role.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "old_name": {"type": "string", "description": "The cast member's current name, exactly as shown."},
                        "new_name": {"type": "string", "description": "The new name."},
                    },
                    "required": ["old_name", "new_name"],
                },
            ),
            types.FunctionDeclaration(
                name="update_cast_role",
                description="Changes a cast member's role/character description (e.g. 'Lead', 'Supporting — Sarah').",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "The cast member's current name, exactly as shown."},
                        "role_size": {"type": "string", "description": "The new role/character description."},
                    },
                    "required": ["name", "role_size"],
                },
            ),
            types.FunctionDeclaration(
                name="add_cast_member",
                description="Adds a new cast member to the production.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role_size": {"type": "string", "description": "Role/character description, e.g. 'Lead'. Optional."},
                    },
                    "required": ["name"],
                },
            ),
            types.FunctionDeclaration(
                name="remove_cast_member",
                description="Removes a cast member from the production (e.g. they dropped out).",
                parameters_json_schema={
                    "type": "object",
                    "properties": {"name": {"type": "string", "description": "The cast member's current name, exactly as shown."}},
                    "required": ["name"],
                },
            ),
            types.FunctionDeclaration(
                name="add_crew_member",
                description="Adds a new crew member to the production.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string", "description": "Department/role, e.g. 'Gaffer'. Optional."},
                        "email": {"type": "string", "description": "Optional."},
                    },
                    "required": ["name"],
                },
            ),
            types.FunctionDeclaration(
                name="update_crew_member",
                description="Updates a crew member's name, role, and/or email. Only include the fields being changed.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "The crew member's current name, exactly as shown."},
                        "new_name": {"type": "string"},
                        "role": {"type": "string"},
                        "email": {"type": "string"},
                    },
                    "required": ["name"],
                },
            ),
            types.FunctionDeclaration(
                name="remove_crew_member",
                description="Removes a crew member from the production.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {"name": {"type": "string", "description": "The crew member's current name, exactly as shown."}},
                    "required": ["name"],
                },
            ),
            types.FunctionDeclaration(
                name="set_shoot_window",
                description="Sets the candidate shoot window (the real date range cast/crew availability "
                "is gathered against) — use when the user gives or changes target production dates.",
                parameters_json_schema={
                    "type": "object",
                    "properties": {
                        "start": {"type": "string", "description": "YYYY-MM-DD"},
                        "end": {"type": "string", "description": "YYYY-MM-DD"},
                    },
                    "required": ["start", "end"],
                },
            ),
        ]
    )
]

_SYSTEM_PREAMBLE = """You are the command-center assistant inside VantageTime, a \
film production scheduling tool. You're shown a compact snapshot of the \
filmmaker's current project (cast, crew, shoot window, locations, shoot \
days) as JSON below. Answer questions about it directly and concisely — \
you're talking to a working filmmaker, not writing a report.

If the user asks you to change something you have a matching tool for \
(rename/add/remove cast or crew, update a role or email, set the shoot \
window), call that tool. You can call more than one tool in a single \
turn if the request has multiple parts (e.g. "rename John to Jonathan \
and add Sarah as a PA"). Always also give a short plain-language reply \
describing what you did or answering the question — never reply with \
just a tool call and no text.

Never invent people, dates, or facts not present in the project snapshot \
or the user's own message. If something the user refers to isn't in the \
snapshot (e.g. a name that doesn't match any cast/crew member), say so \
rather than guessing which one they meant, unless there's an obvious \
close match (e.g. a clear misspelling).

Project snapshot:
"""


def _build_contents(req: ChatRequest) -> list[types.Content]:
    contents = [
        types.Content(role=turn.role, parts=[types.Part(text=turn.text)])
        for turn in req.history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=req.message)]))
    return contents


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    import json

    client = genai.Client()
    system_instruction = _SYSTEM_PREAMBLE + json.dumps(req.project, indent=2)

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=_build_contents(req),
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=_TOOLS,
                http_options=RESILIENT_CONFIG.http_options,
            ),
        )
    except Exception as e:
        logger.exception("Chat generation failed")
        return ChatResponse(
            reply=f"Couldn't reach the model right now ({type(e).__name__}: {e}).",
            actions=[],
        )

    reply_text_parts: list[str] = []
    actions: list[ChatAction] = []

    candidates = response.candidates or []
    parts = candidates[0].content.parts if candidates and candidates[0].content else []
    for part in parts or []:
        if getattr(part, "text", None):
            reply_text_parts.append(part.text)
        fc = getattr(part, "function_call", None)
        if fc is not None:
            actions.append(ChatAction(name=fc.name, args=dict(fc.args or {})))

    reply = " ".join(t.strip() for t in reply_text_parts if t.strip()).strip()
    if not reply:
        reply = "Done." if actions else "I'm not sure how to help with that."

    return ChatResponse(reply=reply, actions=actions)
