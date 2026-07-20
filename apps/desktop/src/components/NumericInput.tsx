import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatNumericValue, parseNumericDraft } from "./numericInputModel";

interface NumericInputProps {
  readonly id?: string;
  readonly className?: string;
  readonly value: number;
  readonly step?: number;
  readonly minimum?: number | undefined;
  readonly maximum?: number | undefined;
  readonly integer?: boolean;
  readonly precision?: number;
  readonly ariaLabel?: string;
  readonly ariaInvalid?: boolean;
  readonly disabled?: boolean;
  readonly onCommit: (value: number) => void;
  readonly onValidationError?: (message: string | null) => void;
}

/**
 * A numeric editor that lets people replace the whole value normally.
 *
 * Native controlled number inputs snap back to their previous value while the
 * user is midway through typing an empty or negative value. This keeps a text
 * draft until commit, selects the old value on focus, and still provides
 * keyboard step controls with Arrow Up and Arrow Down.
 */
export function NumericInput({
  id,
  className,
  value,
  step = 1,
  minimum,
  maximum,
  integer = false,
  precision,
  ariaLabel,
  ariaInvalid = false,
  disabled = false,
  onCommit,
  onValidationError
}: NumericInputProps) {
  const formattedValue = formatNumericValue(value, step, precision);
  const [draft, setDraft] = useState(formattedValue);
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formattedValue);
  }, [formattedValue]);

  const restore = (): void => {
    setDraft(formattedValue);
    onValidationError?.(null);
  };

  const commit = (): void => {
    if (cancelled.current) {
      cancelled.current = false;
      restore();
      return;
    }
    const parsed = parseNumericDraft(draft, { minimum, maximum, integer });
    onValidationError?.(parsed.error);
    if (parsed.value === null) return;
    setDraft(formatNumericValue(parsed.value, step, precision));
    if (parsed.value !== value) onCommit(parsed.value);
  };

  const stepValue = (direction: 1 | -1): void => {
    const parsed = parseNumericDraft(draft, { minimum, maximum, integer });
    const base = parsed.value ?? value;
    let next = base + direction * step;
    if (minimum !== undefined) next = Math.max(minimum, next);
    if (maximum !== undefined) next = Math.min(maximum, next);
    if (integer) next = Math.round(next);
    setDraft(formatNumericValue(next, step, precision));
    onValidationError?.(null);
    if (next !== value) onCommit(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      cancelled.current = true;
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      stepValue(event.key === "ArrowUp" ? 1 : -1);
    }
  };

  return (
    <input
      {...(id === undefined ? {} : { id })}
      {...(className === undefined ? {} : { className })}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      onFocus={(event) => {
        focused.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
