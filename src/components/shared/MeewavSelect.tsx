import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./meewav-select.css";

type Choice = { value: string; label: ReactNode; text: string; disabled: boolean; group?: string };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size">;

function optionText(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : String(child)).join("");
}

function collectChoices(children: ReactNode, group?: string, disabled = false): Choice[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; label?: string; value?: string | number; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return collectChoices(child.props.children, group, disabled);
    if (child.type === "optgroup") return collectChoices(child.props.children, child.props.label, disabled || Boolean(child.props.disabled));
    if (child.type !== "option") return [];
    const text = child.props.label ?? optionText(child.props.children);
    return [{ value: String(child.props.value ?? text), label: child.props.label ?? child.props.children, text, disabled: disabled || Boolean(child.props.disabled), group }];
  });
}

/** One custom menu across rooms, with a native field kept only for form submission. */
export default function MeewavSelect({ children, value, defaultValue, onChange, id, disabled, name, required, className = "", style, autoFocus, title, onInvalid,
  "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...fieldProps }: Props) {
  const generatedId = useId();
  const controlId = id ?? `meewav-select-${generatedId}`;
  const listId = `${controlId}-options`;
  const choices = collectChoices(children);
  const [localValue, setLocalValue] = useState(() => String(defaultValue ?? choices[0]?.value ?? ""));
  const currentValue = String(value ?? localValue);
  const selected = choices.find(choice => choice.value === currentValue);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(currentValue);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLSelectElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", at: 0 });
  const activeIndex = choices.findIndex(choice => choice.value === activeValue && !choice.disabled);
  const optionsKey = choices.map(choice => `${choice.value}:${choice.disabled}`).join("\n");

  const show = (last = false) => {
    if (disabled) return;
    const enabled = choices.filter(choice => !choice.disabled);
    setActiveValue((selected && !selected.disabled ? selected : last ? enabled.at(-1) : enabled[0])?.value ?? "");
    setOpen(true);
  };
  const choose = (choice: Choice) => {
    if (disabled || choice.disabled) return;
    if (field.current && choice.value !== currentValue) {
      field.current.value = choice.value;
      field.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") { setOpen(false); return; }
    if (open) event.stopPropagation();
    if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); return; }
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (open && activeIndex >= 0) choose(choices[activeIndex]);
      else show();
      return;
    }
    const enabled = choices.filter(choice => !choice.disabled);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open && !["Home", "End"].includes(event.key)) { show(event.key === "ArrowUp"); return; }
      const index = enabled.findIndex(choice => choice.value === activeValue);
      const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1)
        : enabled[(Math.max(0, index) + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
      if (next) setActiveValue(next.value);
      setOpen(true);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const letter = event.key.toLocaleLowerCase("fr");
      const text = Date.now() - search.current.at < 700 ? search.current.text + letter : letter;
      search.current = { text, at: Date.now() };
      const match = enabled.find(choice => choice.text.toLocaleLowerCase("fr").startsWith(text));
      if (match) { setActiveValue(match.value); setOpen(true); }
    }
  };

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const flip = below < 180 && above > below;
      const maxHeight = Math.max(80, Math.min(280, flip ? above : below));
      const width = Math.min(Math.max(rect.width, 190), window.innerWidth - 24);
      setPosition({ top: flip ? rect.top - 6 : rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight });
      if (menu.current) menu.current.dataset.placement = flip ? "above" : "below";
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, optionsKey]);
  useLayoutEffect(() => {
    const option = menu.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (option && menu.current) {
      const start = option.offsetTop;
      const end = start + option.offsetHeight;
      if (start < menu.current.scrollTop) menu.current.scrollTop = start;
      else if (end > menu.current.scrollTop + menu.current.clientHeight) menu.current.scrollTop = end - menu.current.clientHeight;
    }
  }, [open, activeValue]);

  return <span className="meewav-select-field">
    <button ref={trigger} type="button" role="combobox" id={controlId} value={currentValue}
      className={`meewav-select ${className}`} style={style} disabled={disabled} autoFocus={autoFocus}
      title={title} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid}
      aria-required={required || undefined} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown}
      onBlur={event => { if (!menu.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <span className="meewav-select__value">{selected?.label ?? "Choisir…"}</span><ChevronDown className="meewav-select__chevron" aria-hidden="true" />
    </button>
    <select {...fieldProps} ref={field} hidden aria-hidden="true" tabIndex={-1} name={name} required={required} disabled={disabled} value={currentValue}
      onChange={event => { setLocalValue(event.target.value); onChange?.(event); }}
      onInvalid={event => { event.preventDefault(); trigger.current?.focus(); onInvalid?.(event); }}>{children}</select>
    {open && createPortal(<div ref={menu} id={listId} role="listbox" aria-label={ariaLabel} aria-labelledby={ariaLabel ? undefined : ariaLabelledBy ?? controlId}
      className="meewav-select-menu" style={position} onPointerDown={event => event.preventDefault()}>
      {choices.map((choice, index) => <Fragment key={`${choice.group ?? ""}:${choice.value}`}>
        {choice.group && choice.group !== choices[index - 1]?.group ? <div className="meewav-select-menu__group" role="presentation">{choice.group}</div> : null}
        <div role="option" id={`${listId}-${index}`} aria-selected={choice.value === currentValue} aria-disabled={choice.disabled || undefined}
          data-active={choice.value === activeValue && !choice.disabled} className="meewav-select-menu__option"
          onPointerMove={() => { if (!choice.disabled) setActiveValue(choice.value); }}
          onClick={event => { event.stopPropagation(); choose(choice); }}>
          <span>{choice.label}</span>{choice.value === currentValue ? <Check aria-hidden="true" /> : null}
        </div>
      </Fragment>)}
      {!choices.length ? <span className="meewav-select-menu__empty">Aucune option disponible</span> : null}
    </div>, trigger.current?.closest("dialog") ?? document.fullscreenElement ?? document.body)}
  </span>;
}
