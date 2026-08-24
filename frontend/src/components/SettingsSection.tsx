"use client";

import { CompanyProfile, TeamMember } from "@/lib/types";

const PROFILE_FIELDS: { key: keyof CompanyProfile; label: string; type: string }[] = [
  { key: "companyName", label: "Company / Production Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "website", label: "Website", type: "text" },
];

export default function SettingsSection({
  companyProfile,
  team,
  activeProjectCount,
  archivedProjectCount,
  onUpdateCompanyProfile,
  onAddTeamMember,
  onUpdateTeamMember,
  onRemoveTeamMember,
  onClearAllData,
}: {
  companyProfile: CompanyProfile;
  team: TeamMember[];
  activeProjectCount: number;
  archivedProjectCount: number;
  onUpdateCompanyProfile: (profile: CompanyProfile) => void;
  onAddTeamMember: () => void;
  onUpdateTeamMember: (id: string, patch: Partial<TeamMember>) => void;
  onRemoveTeamMember: (id: string) => void;
  onClearAllData: () => void;
}) {
  function patchProfile(patch: Partial<CompanyProfile>) {
    onUpdateCompanyProfile({ ...companyProfile, ...patch });
  }

  return (
    <div>
      <div className="mb-10">
        <h1
          className="title-gradient text-3xl uppercase leading-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Settings
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-dim">
          Your production company profile and regular team — saved once here instead of
          re-typed on every new project. Stored locally in this browser only.
        </p>
      </div>

      {/* Company profile */}
      <section className="mb-10 rounded-2xl border border-edge bg-panel p-6">
        <div className="tracked mb-1 text-xs font-medium text-accent uppercase">Profile</div>
        <h2 className="text-lg font-semibold text-ink">Company Profile</h2>
        <p className="mt-1 text-xs text-faint">
          Used as your default identity — you can still override company info per project from
          the Call Sheet tab.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-[10px] text-faint uppercase tracked">{f.label}</span>
              <input
                type={f.type}
                value={companyProfile[f.key]}
                onChange={(e) => patchProfile({ [f.key]: e.target.value })}
                className="rounded-md border border-edge bg-panel2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[10px] text-faint uppercase tracked">Address</span>
            <textarea
              value={companyProfile.address}
              onChange={(e) => patchProfile({ address: e.target.value })}
              rows={2}
              className="rounded-md border border-edge bg-panel2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* Production team */}
      <section className="mb-10 rounded-2xl border border-edge bg-panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="tracked mb-1 text-xs font-medium text-accent uppercase">Users</div>
            <h2 className="text-lg font-semibold text-ink">Production Team</h2>
            <p className="mt-1 text-xs text-faint">
              Collaborators you work with across productions — UPM, DP, sound, etc. This is a
              reference directory, separate from any single project&apos;s cast/crew roster
              (see the Members tab inside a project).
            </p>
          </div>
          <button
            onClick={onAddTeamMember}
            className="btn-poster shrink-0 rounded-full px-4 py-2 text-xs font-semibold"
          >
            + Add Member
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {team.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-1 gap-2 rounded-xl border border-edge bg-panel2 p-3 sm:grid-cols-[1.2fr_1fr_1.2fr_1fr_auto] sm:items-center"
            >
              <input
                type="text"
                value={m.name}
                onChange={(e) => onUpdateTeamMember(m.id, { name: e.target.value })}
                placeholder="Name"
                className="rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                value={m.role}
                onChange={(e) => onUpdateTeamMember(m.id, { role: e.target.value })}
                placeholder="Role (e.g. DP, UPM)"
                className="rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <input
                type="email"
                value={m.email}
                onChange={(e) => onUpdateTeamMember(m.id, { email: e.target.value })}
                placeholder="Email"
                className="rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                value={m.phone}
                onChange={(e) => onUpdateTeamMember(m.id, { phone: e.target.value })}
                placeholder="Phone"
                className="rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => onRemoveTeamMember(m.id)}
                title="Remove"
                className="justify-self-start text-sm text-faint transition hover:text-red-700 sm:justify-self-center"
              >
                ×
              </button>
            </div>
          ))}
          {team.length === 0 && (
            <p className="rounded-xl border border-dashed border-edge px-3 py-6 text-center text-xs text-faint">
              No team members yet. Add the people you work with regularly.
            </p>
          )}
        </div>
      </section>

      {/* Data */}
      <section className="rounded-2xl border border-edge bg-panel p-6">
        <div className="tracked mb-1 text-xs font-medium text-accent uppercase">Data</div>
        <h2 className="text-lg font-semibold text-ink">Local Storage</h2>
        <p className="mt-1 text-xs text-faint">
          Everything in VantageTime — projects, breakdowns, schedules, this settings page — lives
          only in this browser&apos;s local storage. There&apos;s no account and nothing is synced
          anywhere.
        </p>
        <div className="mt-4 flex flex-wrap gap-8">
          <div>
            <div className="text-2xl font-semibold text-ink">{activeProjectCount}</div>
            <div className="tracked mt-1 text-[10px] text-faint uppercase">Active Projects</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-ink">{archivedProjectCount}</div>
            <div className="tracked mt-1 text-[10px] text-faint uppercase">Archived Projects</div>
          </div>
        </div>
        <button
          onClick={onClearAllData}
          className="tracked mt-5 rounded-full border border-red-500/40 px-4 py-2 text-xs text-red-700 uppercase transition hover:bg-red-500/10"
        >
          Clear all local data
        </button>
      </section>
    </div>
  );
}
