"use client";

import { useState } from "react";
import StageHeader from "./StageHeader";
import { emptyOtherItem } from "@/lib/locationAvailability";
import { CastMember, CrewMember, OtherItem } from "@/lib/types";

type MemberType = "Cast" | "Crew" | "Other";

const TYPE_STYLE: Record<MemberType, string> = {
  Cast: "border-accent/50 bg-accent/10 text-accent",
  Crew: "border-blue/50 bg-blue/10 text-blue",
  Other: "border-mint/50 bg-mint/10 text-mint",
};

export default function MembersSection({
  cast,
  crew,
  otherItems,
  castEmails,
  onAddCastMember,
  onUpdateCastRole,
  onRemoveCastMember,
  onUpdateCastEmails,
  onAddCrewMember,
  onUpdateCrewMember,
  onRemoveCrewMember,
  onUpdateOtherItems,
}: {
  cast: CastMember[];
  crew: CrewMember[];
  otherItems: OtherItem[];
  castEmails: Record<string, string>;
  onAddCastMember: (name: string, role_size: string) => void;
  onUpdateCastRole: (name: string, role_size: string) => void;
  onRemoveCastMember: (name: string) => void;
  onUpdateCastEmails: (emails: Record<string, string>) => void;
  onAddCrewMember: (name: string, role: string, email: string) => void;
  onUpdateCrewMember: (name: string, patch: { new_name?: string; role?: string; email?: string }) => void;
  onRemoveCrewMember: (name: string) => void;
  onUpdateOtherItems: (items: OtherItem[]) => void;
}) {
  const [quickType, setQuickType] = useState<MemberType>("Cast");
  const [quickName, setQuickName] = useState("");

  function handleQuickAdd() {
    const name = quickName.trim();
    if (!name) return;
    if (quickType === "Cast") onAddCastMember(name, "");
    else if (quickType === "Crew") onAddCrewMember(name, "", "");
    else onUpdateOtherItems([...otherItems, emptyOtherItem(crypto.randomUUID(), name, "")]);
    setQuickName("");
  }

  function patchOtherItem(id: string, patch: Partial<OtherItem>) {
    onUpdateOtherItems(otherItems.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function removeOtherItem(id: string) {
    onUpdateOtherItems(otherItems.filter((o) => o.id !== id));
  }

  return (
    <div>
      <StageHeader
        index={3}
        title="Members"
        description="Add anyone to the roster in a couple seconds — just a name and a type. Fill in role, email, availability, and priority later from the Dates tab's Roster & Availability sub-tab."
      />

      <div className="mb-8 rounded-xl border border-edge bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["Cast", "Crew", "Other"] as MemberType[]).map((t) => (
            <button
              key={t}
              onClick={() => setQuickType(t)}
              className={`tracked rounded-full border px-4 py-1.5 text-xs uppercase transition ${
                quickType === t
                  ? TYPE_STYLE[t]
                  : "border-edge text-faint hover:text-dim"
              }`}
            >
              {t}
            </button>
          ))}
          <input
            type="text"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
            placeholder={`${quickType} member's name`}
            className="min-w-[200px] flex-1 rounded-full border border-edge bg-panel2 px-4 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickName.trim()}
            className="btn-poster rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            + Add {quickType}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="tracked mb-3 flex items-center justify-between text-[10px] text-faint uppercase">
            <span>Cast</span>
            <span>{cast.length}</span>
          </div>
          <div className="space-y-3">
            {cast.map((c) => (
              <div key={c.name} className="rounded-xl border border-edge bg-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`tracked mb-2 inline-block rounded-full border px-2 py-0.5 text-[9px] uppercase ${TYPE_STYLE.Cast}`}
                  >
                    Cast
                  </span>
                  <button
                    onClick={() => onRemoveCastMember(c.name)}
                    title="Remove"
                    className="shrink-0 text-sm text-faint transition hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
                <div className="text-xs font-medium text-ink">{c.name}</div>
                <input
                  type="text"
                  value={c.role_size}
                  onChange={(e) => onUpdateCastRole(c.name, e.target.value)}
                  placeholder="Role (optional)"
                  className="mt-2 w-full rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <input
                  type="email"
                  value={castEmails[c.name] ?? ""}
                  onChange={(e) => onUpdateCastEmails({ ...castEmails, [c.name]: e.target.value })}
                  placeholder="Email (optional)"
                  className="mt-1.5 w-full rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            ))}
            {cast.length === 0 && (
              <p className="rounded-xl border border-dashed border-edge px-3 py-6 text-center text-[11px] text-faint">
                No cast yet.
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="tracked mb-3 flex items-center justify-between text-[10px] text-faint uppercase">
            <span>Crew</span>
            <span>{crew.length}</span>
          </div>
          <div className="space-y-3">
            {crew.map((c) => (
              <div key={c.id} className="rounded-xl border border-edge bg-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`tracked mb-2 inline-block rounded-full border px-2 py-0.5 text-[9px] uppercase ${TYPE_STYLE.Crew}`}
                  >
                    Crew
                  </span>
                  <button
                    onClick={() => onRemoveCrewMember(c.name)}
                    title="Remove"
                    className="shrink-0 text-sm text-faint transition hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
                <div className="text-xs font-medium text-ink">{c.name}</div>
                <input
                  type="text"
                  value={c.role}
                  onChange={(e) => onUpdateCrewMember(c.name, { role: e.target.value })}
                  placeholder="Role (optional)"
                  className="mt-2 w-full rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <input
                  type="email"
                  value={c.email}
                  onChange={(e) => onUpdateCrewMember(c.name, { email: e.target.value })}
                  placeholder="Email (optional)"
                  className="mt-1.5 w-full rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            ))}
            {crew.length === 0 && (
              <p className="rounded-xl border border-dashed border-edge px-3 py-6 text-center text-[11px] text-faint">
                No crew yet.
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="tracked mb-3 flex items-center justify-between text-[10px] text-faint uppercase">
            <span>Other</span>
            <span>{otherItems.length}</span>
          </div>
          <div className="space-y-3">
            {otherItems.map((o) => (
              <div key={o.id} className="rounded-xl border border-edge bg-panel p-3">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`tracked mb-2 inline-block rounded-full border px-2 py-0.5 text-[9px] uppercase ${TYPE_STYLE.Other}`}
                  >
                    Other
                  </span>
                  <button
                    onClick={() => removeOtherItem(o.id)}
                    title="Remove"
                    className="shrink-0 text-sm text-faint transition hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
                <div className="text-xs font-medium text-ink">{o.name}</div>
                <input
                  type="email"
                  value={o.email}
                  onChange={(e) => patchOtherItem(o.id, { email: e.target.value })}
                  placeholder="Email (optional)"
                  className="mt-2 w-full rounded-md border border-edge bg-panel2 px-2 py-1 text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
            ))}
            {otherItems.length === 0 && (
              <p className="rounded-xl border border-dashed border-edge px-3 py-6 text-center text-[11px] text-faint">
                No rentals/vendors yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
