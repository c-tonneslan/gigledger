import clsx from "clsx";

export default function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "warn" | "good";
}) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div
        className={clsx(
          "metric mt-1",
          tone === "warn" && "text-accent-warn",
          tone === "good" && "text-accent",
        )}
      >
        {value}
      </div>
      {hint && <div className="subtle mt-1">{hint}</div>}
    </div>
  );
}
