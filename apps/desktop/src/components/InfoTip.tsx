import { Info } from "lucide-react";

interface InfoTipProps {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly align?: "left" | "right";
}

/**
 * Short, plain-language help that works with hover, keyboard focus, and click.
 */
export function InfoTip({ label, children, align = "left" }: InfoTipProps) {
  return (
    <details className={`info-tip info-tip--${align}`}>
      <summary aria-label={`Help: ${label}`} title={`Help: ${label}`}>
        <Info size={14} aria-hidden="true" />
      </summary>
      <div className="info-tip__popover" role="note">
        <strong>{label}</strong>
        <p>{children}</p>
      </div>
    </details>
  );
}
