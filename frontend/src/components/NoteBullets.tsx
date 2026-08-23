import { toBullets } from "@/lib/text";

/** Renders agent-written prose (weather/permit/logistics notes) as a
 * short bullet list instead of a solid paragraph — the same information,
 * just actually scannable. Renders nothing if the text is empty. */
export default function NoteBullets({
  text,
  max = 4,
  className = "",
}: {
  text: string;
  max?: number;
  className?: string;
}) {
  const bullets = toBullets(text, max);
  if (bullets.length === 0) return null;
  return (
    <ul className={`list-disc space-y-0.5 pl-3.5 ${className}`}>
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}
