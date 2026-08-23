import { ReactNode } from "react";

export default function StageHeader({
  index,
  title,
  description,
  meta,
  action,
}: {
  index: number;
  title: string;
  description: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-6">
      <div>
        <h2
          className="title-gradient text-3xl uppercase leading-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {String(index).padStart(2, "0")} · {title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-dim">{description}</p>
        {meta && <p className="tracked mt-2 text-xs text-faint">{meta}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
