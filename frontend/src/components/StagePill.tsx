export default function StagePill({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        done ? "bg-accent/15 text-accent" : "bg-panel2 text-faint"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] ${
          done ? "bg-accent text-accent-ink" : "border border-edge"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      {label}
    </span>
  );
}
