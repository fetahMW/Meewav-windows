import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export type PlaceToolsSwitchItem<ToolId extends string> = {
  id: ToolId;
  label: string;
  shortLabel?: string;
  icon: ReactNode;
  controlsId?: string;
  disabled?: boolean;
};

type PlaceToolsSwitchProps<ToolId extends string> = {
  activeTool: ToolId;
  ariaLabel?: string;
  idPrefix?: string;
  items: readonly PlaceToolsSwitchItem<ToolId>[];
  onSelect: (toolId: ToolId) => void;
  semantics?: "buttons" | "tabs";
};

/**
 * Canonical tool rail from La Place.
 *
 * Specialized Rooms reuse this component so the tool CTAs keep the exact
 * same markup, interaction states and visual treatment as La Place.
 */
export default function PlaceToolsSwitch<ToolId extends string>({
  activeTool,
  ariaLabel = "Outils de la régie",
  idPrefix = "place-tool-switch",
  items,
  onSelect,
  semantics = "buttons",
}: PlaceToolsSwitchProps<ToolId>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const usesTabs = semantics === "tabs";

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!usesTabs || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabledIndexes = items
      .map((item, itemIndex) => item.disabled ? -1 : itemIndex)
      .filter((itemIndex) => itemIndex >= 0);
    if (!enabledIndexes.length) return;
    const currentEnabledIndex = Math.max(0, enabledIndexes.indexOf(index));
    const targetIndex = event.key === "Home"
      ? enabledIndexes[0]
      : event.key === "End"
        ? enabledIndexes[enabledIndexes.length - 1]
        : enabledIndexes[(currentEnabledIndex + (event.key === "ArrowRight" ? 1 : -1) + enabledIndexes.length) % enabledIndexes.length];
    const target = items[targetIndex];
    if (!target) return;
    onSelect(target.id);
    buttonRefs.current[targetIndex]?.focus();
  };

  return <nav className="place-tools-console__switch" style={{ "--studio-nav-columns": items.length } as CSSProperties} aria-label={ariaLabel} role={usesTabs ? "tablist" : undefined}>
    {items.map((item, index) => {
      const active = activeTool === item.id;
      return <button
        ref={(node) => { buttonRefs.current[index] = node; }}
        type="button"
        key={item.id}
        id={usesTabs ? `${idPrefix}-${item.id}` : undefined}
        role={usesTabs ? "tab" : undefined}
        className={active ? "is-active" : ""}
        aria-label={item.shortLabel ? item.label : undefined}
        title={item.shortLabel ? item.label : undefined}
        aria-controls={usesTabs ? item.controlsId : undefined}
        aria-pressed={usesTabs ? undefined : active}
        aria-selected={usesTabs ? active : undefined}
        tabIndex={usesTabs ? active ? 0 : -1 : undefined}
        disabled={item.disabled}
        onKeyDown={(event) => onKeyDown(event, index)}
        onClick={() => onSelect(item.id)}
      >
        {item.icon}
        <span>{item.shortLabel ?? item.label}</span>
      </button>;
    })}
  </nav>;
}
