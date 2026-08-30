"use client";

import { useEffect, useRef, useState } from "react";
import { ChatTurn, sendChatMessage } from "@/lib/api";
import { buildChatContext } from "@/lib/chatContext";
import { ChatAction, ChatMessage, ChatThread, Project } from "@/lib/types";

// Only the 4 most-recently-active threads survive a save — this is a
// lightweight "recent chats" list, not a permanent transcript archive,
// so unbounded growth in localStorage was never the goal.
const MAX_THREADS = 4;

// Human-readable label for an executed action, shown as a small chip
// under the assistant's reply — lets the filmmaker see at a glance what
// actually changed, not just read prose and hope it matches.
function describeAction(action: ChatAction): string {
  const a = action.args;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (action.name) {
    case "rename_cast_member":
      return `Renamed ${str(a.old_name)} → ${str(a.new_name)}`;
    case "update_cast_role":
      return `Updated ${str(a.name)}'s role`;
    case "add_cast_member":
      return `Added cast: ${str(a.name)}`;
    case "remove_cast_member":
      return `Removed cast: ${str(a.name)}`;
    case "add_crew_member":
      return `Added crew: ${str(a.name)}`;
    case "update_crew_member":
      return `Updated crew: ${str(a.name)}`;
    case "remove_crew_member":
      return `Removed crew: ${str(a.name)}`;
    case "set_shoot_window":
      return `Set shoot window: ${str(a.start)} – ${str(a.end)}`;
    default:
      return action.name;
  }
}

function previewOf(thread: ChatThread): string {
  const firstUser = thread.messages.find((m) => m.role === "user");
  const text = firstUser?.text.trim() || "New chat";
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

function timeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function mostRecent(threads: ChatThread[]): ChatThread | null {
  if (threads.length === 0) return null;
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/** The Command Center chat — a floating bubble, not a fixed sidebar, so
 * it doesn't eat screen width on every tab. History is per-project (the
 * parent remounts this with key={project.id} on project switch, so one
 * project's chat never bleeds into another's) and capped at the 4
 * most-recently-active threads, persisted on the Project itself via
 * onUpdateThreads so it survives a reload the same way everything else
 * in this app does. */
export default function ChatPanel({
  project,
  threads,
  onUpdateThreads,
  onAction,
}: {
  project: Project;
  threads: ChatThread[];
  onUpdateThreads: (threads: ChatThread[]) => void;
  onAction: (action: ChatAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => mostRecent(threads)?.id ?? null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const messages = activeThread?.messages ?? [];

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending, open]);

  function persistThread(thread: ChatThread) {
    const merged = [...threads.filter((t) => t.id !== thread.id), thread].sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
    onUpdateThreads(merged.slice(0, MAX_THREADS));
  }

  function handleNewChat() {
    setActiveThreadId(null);
    setInput("");
    setError(null);
    setShowHistory(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);

    const now = Date.now();
    const base: ChatThread = activeThread ?? { id: crypto.randomUUID(), createdAt: now, updatedAt: now, messages: [] };
    const userMsg: ChatMessage = { role: "user", text };
    const historyForApi: ChatTurn[] = base.messages.map((m) => ({ role: m.role, text: m.text }));
    const withUser: ChatThread = { ...base, messages: [...base.messages, userMsg], updatedAt: now };

    setActiveThreadId(withUser.id);
    persistThread(withUser);
    setSending(true);

    try {
      const result = await sendChatMessage(text, historyForApi, buildChatContext(project));
      for (const action of result.actions) onAction(action);
      const modelMsg: ChatMessage = { role: "model", text: result.reply, actions: result.actions };
      persistThread({ ...withUser, messages: [...withUser.messages, modelMsg], updatedAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setSending(false);
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[540px] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-edge bg-bg2 shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
              <span className="title-gradient text-sm uppercase" style={{ fontFamily: "var(--font-display)" }}>
                Command Center
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                title="New chat"
                className="tracked rounded-full border border-edge px-2.5 py-1 text-[10px] uppercase text-dim transition hover:border-accent hover:text-accent"
              >
                + New
              </button>
              <button
                onClick={() => setShowHistory((v) => !v)}
                title="Recent chats"
                className={`tracked rounded-full border px-2.5 py-1 text-[10px] uppercase transition ${
                  showHistory ? "border-accent text-accent" : "border-edge text-dim hover:text-ink"
                }`}
              >
                History
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="flex h-6 w-6 items-center justify-center rounded-full text-dim transition hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="filmstrip" />

          {showHistory && (
            <div className="max-h-40 overflow-y-auto border-b border-edge bg-panel2 px-2 py-2">
              {threads.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-faint">No previous chats yet.</p>
              ) : (
                [...threads]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setActiveThreadId(t.id);
                        setShowHistory(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                        t.id === activeThreadId ? "bg-accent/10 text-accent" : "text-ink hover:bg-panel"
                      }`}
                    >
                      <span className="truncate">{previewOf(t)}</span>
                      <span className="tracked shrink-0 text-[9px] uppercase text-faint">{timeAgo(t.updatedAt)}</span>
                    </button>
                  ))
              )}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="text-xs leading-relaxed text-faint">
                Ask about this project, or tell it what to change — e.g. &ldquo;rename Marcus to Marcus
                Lee&rdquo;, &ldquo;add Priya as a gaffer&rdquo;, or &ldquo;who hasn&apos;t responded
                yet?&rdquo;
              </p>
            )}
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              const grouped = i > 0 && messages[i - 1].role === m.role;
              const tailCorner = isUser
                ? grouped
                  ? "rounded-br-[18px]"
                  : "rounded-br-[4px]"
                : grouped
                  ? "rounded-bl-[18px]"
                  : "rounded-bl-[4px]";

              return (
                <div
                  key={i}
                  className={`flex items-end gap-2 ${grouped ? "mt-1" : "mt-3"} ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {!isUser && !grouped && (
                    <span className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-coral text-[10px] text-accent-ink shadow-[0_2px_6px_-1px_rgba(217,100,10,0.6)]">
                      ✦
                    </span>
                  )}
                  {!isUser && grouped && <span className="w-6 shrink-0" />}
                  <div
                    className={
                      isUser
                        ? `btn-poster max-w-[78%] rounded-[18px] ${tailCorner} px-3.5 py-2 text-xs`
                        : `max-w-[78%] rounded-[18px] ${tailCorner} border border-edge bg-panel px-3.5 py-2 text-xs text-ink shadow-[0_2px_8px_-4px_rgba(23,19,13,0.25)]`
                    }
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    {m.actions && m.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.actions.map((a, ai) => (
                          <span
                            key={ai}
                            className="tracked rounded-full border border-mint/50 bg-mint/10 px-2 py-0.5 text-[10px] uppercase text-ink"
                          >
                            ✓ {describeAction(a)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="mt-3 flex items-end gap-2">
                <span className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-coral text-[10px] text-accent-ink shadow-[0_2px_6px_-1px_rgba(217,100,10,0.6)]">
                  ✦
                </span>
                <div className="flex items-center gap-1 rounded-[18px] rounded-bl-[4px] border border-edge bg-panel px-3.5 py-2.5 shadow-[0_2px_8px_-4px_rgba(23,19,13,0.25)]">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-faint" />
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-faint [animation-delay:0.2s]" />
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-faint [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            {error && (
              <p className="mt-3 rounded-md border-l-2 border-coral/60 bg-coral/10 px-2 py-1 text-[11px] text-coral">
                {error}
              </p>
            )}
          </div>

          <div className="p-3">
            <div className="flex items-end gap-2 rounded-full border border-edge bg-panel px-2 py-1.5 transition focus-within:border-accent">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask or tell it what to change…"
                rows={1}
                className="max-h-24 flex-1 resize-none bg-transparent px-2 py-1 text-xs text-ink outline-none placeholder:text-faint"
              />
              <button
                onClick={() => void handleSend()}
                disabled={sending || !input.trim()}
                aria-label="Send"
                className="btn-poster flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm leading-none disabled:opacity-40"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Command Center" : "Open Command Center"}
        className="btn-poster fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl leading-none"
      >
        {open ? (
          "✕"
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.5 4.25A.5.5 0 0 1 4.7 20V16h-.2A2.5 2.5 0 0 1 2 13.5v-8A2.5 2.5 0 0 1 4.5 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="8" cy="9.5" r="1" fill="currentColor" />
            <circle cx="12" cy="9.5" r="1" fill="currentColor" />
            <circle cx="16" cy="9.5" r="1" fill="currentColor" />
          </svg>
        )}
      </button>
    </>
  );
}
