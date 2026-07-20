import { Info } from "lucide-react";
import { useId, useState } from "react";

interface InfoTipProps {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly align?: "left" | "right";
}

/**
 * Short, plain-language help that opens on pointer hover or keyboard focus.
 * A mouse click intentionally does not pin the help window open.
 */
export function InfoTip({ label, children, align = "left" }: InfoTipProps) {
  const descriptionId = useId();
  const [visible, setVisible] = useState(false);
  return (
    <span
      className={`info-tip info-tip--${align} ${visible ? "info-tip--visible" : ""}`}
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
    >
      <span
        className="info-tip__trigger"
        role="img"
        tabIndex={0}
        aria-label={`Help: ${label}`}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        <Info size={14} aria-hidden="true" />
      </span>
      <span className="info-tip__popover" id={descriptionId} role="note">
        <strong>{label}</strong>
        <p>{children}</p>
      </span>
    </span>
  );
}
