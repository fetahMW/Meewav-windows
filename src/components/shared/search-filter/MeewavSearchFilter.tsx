import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type CSSProperties,
  type FocusEventHandler,
  type FormEventHandler,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Funnel, Search, X } from "lucide-react";
import "../../../features/globe/styles/globe-v2.css";
import "./meewav-search-filter.css";

type MeewavSearchFilterBarProps = {
  inputId?: string;
  query: string;
  placeholder: string;
  inputAriaLabel: string;
  inputAriaKeyShortcuts?: string;
  onQueryChange: ChangeEventHandler<HTMLInputElement>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onInputFocus?: () => void;
  onInputKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFormBlur?: FocusEventHandler<HTMLFormElement>;
  onClear: () => void;
  onToggleFilters: () => void;
  filterOpen: boolean;
  filterActive?: boolean;
  activeFilterCount?: number;
  filterPanelId: string;
  formRef?: RefObject<HTMLFormElement | null>;
  inputRef?: RefObject<HTMLInputElement | null>;
  filterTriggerRef?: RefObject<HTMLButtonElement | null>;
  suggestionListId?: string;
  expanded?: boolean;
  activeDescendant?: string;
  ghostCompletion?: string;
  shortcutHint?: string;
  placement?: "map" | "flow";
  className?: string;
};

export function MeewavSearchFilterBar({
  inputId,
  query,
  placeholder,
  inputAriaLabel,
  inputAriaKeyShortcuts,
  onQueryChange,
  onSubmit,
  onInputFocus,
  onInputKeyDown,
  onFormBlur,
  onClear,
  onToggleFilters,
  filterOpen,
  filterActive = false,
  activeFilterCount = 0,
  filterPanelId,
  formRef,
  inputRef,
  filterTriggerRef,
  suggestionListId,
  expanded = false,
  activeDescendant,
  ghostCompletion,
  shortcutHint,
  placement = "map",
  className = "",
}: MeewavSearchFilterBarProps) {
  return (
    <form
      ref={formRef}
      className={`search-bar meewav-search-filter-bar is-${placement}${expanded ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      role="search"
      onSubmit={onSubmit ?? ((event) => event.preventDefault())}
      onBlur={onFormBlur}
    >
      <button
        className="search-submit-button"
        type="submit"
        aria-label="Lancer la recherche"
        onMouseDown={(event) => event.preventDefault()}
      >
        <Search size={17} aria-hidden="true" />
      </button>
      <div className="search-input-shell">
        {ghostCompletion ? (
          <div className="search-ghost-completion" aria-hidden="true">
            <span className="search-ghost-completion__typed">{query}</span>
            <span>{ghostCompletion}</span>
          </div>
        ) : null}
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          value={query}
          onChange={onQueryChange}
          onFocus={onInputFocus}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
          aria-keyshortcuts={inputAriaKeyShortcuts}
          aria-autocomplete={suggestionListId ? "list" : undefined}
          aria-controls={suggestionListId}
          aria-expanded={suggestionListId ? expanded : undefined}
          aria-activedescendant={activeDescendant}
        />
      </div>
      {query ? (
        <button
          className="search-clear-button"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          aria-label="Effacer la recherche"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
      {shortcutHint ? (
        <kbd className="meewav-search-filter-bar__shortcut" title="Raccourci clavier de recherche">
          {shortcutHint}
        </kbd>
      ) : null}
      <button
        ref={filterTriggerRef}
        onBlur={(event) => delete event.currentTarget.dataset.pointerFocusRestored}
        onKeyDown={(event) => delete event.currentTarget.dataset.pointerFocusRestored}
        className={`search-filter-button ${filterOpen || filterActive ? "is-active" : ""}`}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggleFilters}
        aria-label={filterOpen ? "Fermer les filtres" : "Ouvrir les filtres"}
        aria-expanded={filterOpen}
        aria-controls={filterPanelId}
        title="Filtres"
      >
        <Funnel size={15} aria-hidden="true" />
        {activeFilterCount > 0 ? (
          <span className="search-filter-button__count">{activeFilterCount}</span>
        ) : null}
      </button>
    </form>
  );
}

type MeewavFilterPanelProps = {
  open: boolean;
  panelId: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
  resetLabel?: string;
  applyLabel?: string;
  applyDisabled?: boolean;
  selectionHint?: ReactNode;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  bodyRef?: RefObject<HTMLDivElement | null>;
  bodyProps?: HTMLAttributes<HTMLDivElement>;
  boundarySelector?: string;
  dockRight?: boolean;
  belowHeader?: boolean;
  leftBoundarySelector?: string;
};

export function MeewavFilterPanel({
  open,
  panelId,
  eyebrow,
  title,
  description,
  children,
  onClose,
  onReset,
  onApply,
  resetLabel = "Réinitialiser",
  applyLabel = "Appliquer",
  applyDisabled = false,
  selectionHint,
  triggerRef,
  bodyRef,
  bodyProps,
  boundarySelector,
  dockRight = false,
  belowHeader = false,
  leftBoundarySelector,
}: MeewavFilterPanelProps) {
  const generatedTitleId = useId().replace(/:/g, "");
  const titleId = `${panelId}-${generatedTitleId}-title`;
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const [boundaryInsets, setBoundaryInsets] = useState<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null>(null);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if ((!boundarySelector && !belowHeader) || !triggerRef?.current) {
      setBoundaryInsets(null);
      return undefined;
    }

    const updateBoundary = () => {
      const trigger = triggerRef.current;
      if (belowHeader && trigger) {
        const header = trigger.closest("header");
        const form = trigger.closest("form");
        if (!header || !form) return;
        const search = form.getBoundingClientRect();
        const rail = leftBoundarySelector ? document.querySelector(leftBoundarySelector) : null;
        const railEdge = rail?.getBoundingClientRect().right;
        const anchored = window.innerWidth > 760 && railEdge !== undefined;
        const width = anchored ? Math.max(0, search.right - railEdge) : Math.min(420, Math.max(340, search.width), window.innerWidth - 24);
        const left = anchored ? railEdge : Math.max(12, Math.min(search.right - width, window.innerWidth - width - 12));
        setBoundaryInsets({ top: header.getBoundingClientRect().bottom, left, right: window.innerWidth - left - width, bottom: window.innerWidth <= 760 ? 84 : 16 });
        return;
      }
      const boundary = boundarySelector ? trigger?.closest<HTMLElement>(boundarySelector) : null;
      if (!trigger || !boundary) {
        setBoundaryInsets(null);
        return;
      }
      const boundaryRect = boundary.getBoundingClientRect();
      setBoundaryInsets({
        top: Math.max(0, boundaryRect.top),
        right: Math.max(0, window.innerWidth - boundaryRect.right),
        bottom: Math.max(0, window.innerHeight - boundaryRect.bottom),
        left: Math.max(0, boundaryRect.left),
      });
    };

    updateBoundary();
    if (!open) return undefined;
    const boundary = triggerRef.current?.closest(belowHeader ? "header" : boundarySelector!);
    const observer = (dockRight || belowHeader) && boundary && typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateBoundary) : null;
    if (boundary) observer?.observe(boundary);
    window.addEventListener("resize", updateBoundary);
    if (dockRight || belowHeader) window.addEventListener("scroll", updateBoundary, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateBoundary);
      if (dockRight || belowHeader) window.removeEventListener("scroll", updateBoundary, true);
    };
  }, [boundarySelector, open, triggerRef, dockRight, belowHeader, leftBoundarySelector]);

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const trigger = triggerRef?.current;
    let keyboardInteraction = trigger?.matches(":focus-visible") ?? false;
    const handlePointerDown = () => { keyboardInteraction = false; };
    const previousOverflow = document.body.style.overflow;
    if (!dockRight) document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      // A drawer is still translated outside its clipped viewport here. Native
      // focus scrolling would move that viewport while the CSS slide runs.
      panel?.querySelector<HTMLElement>("button, input, select, [tabindex]:not([tabindex='-1'])")?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
      )).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (!dockRight) document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.requestAnimationFrame(() => {
        if (!trigger?.isConnected) return;
        if (keyboardInteraction) delete trigger.dataset.pointerFocusRestored;
        else trigger.dataset.pointerFocusRestored = "true";
        trigger.focus({ preventScroll: true });
      });
    };
  }, [open, triggerRef, dockRight]);

  const boundaryClass = boundaryInsets ? " is-bounded" : "";
  const boundaryStyle = boundaryInsets ? {
    "--meewav-filter-panel-top": `${boundaryInsets.top}px`,
    "--meewav-filter-panel-right": `${boundaryInsets.right}px`,
    "--meewav-filter-panel-bottom": `${boundaryInsets.bottom}px`,
    "--meewav-filter-panel-left": `${boundaryInsets.left}px`,
  } as CSSProperties : undefined;
  const panelLayer = (
    <>
      <button
        type="button"
        className={`meewav-filter-panel__backdrop${open ? " is-open" : ""}${boundaryClass}`}
        style={boundaryStyle}
        aria-label="Fermer les filtres"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id={panelId}
        className={`side-panel artist-filter-panel meewav-filter-panel${open ? " is-open" : ""}${boundaryClass}`}
        style={boundaryStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        <div className="side-panel__header">
          <div className="artist-filter-panel__heading">
            <span className="artist-filter-panel__headingIcon" aria-hidden="true">
              <Funnel size={20} strokeWidth={1.8} />
            </span>
            <div className="artist-filter-panel__headingCopy">
              <span className="artist-filter-panel__eyebrow">{eyebrow}</span>
              <strong id={titleId}>{title}</strong>
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          <button className="side-panel__close" type="button" onClick={onClose} aria-label="Fermer les filtres">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div ref={bodyRef} className="artist-filter-panel__body" {...bodyProps}>
          {children}
        </div>
        {selectionHint ? <p className="artist-filter-panel__selectionHint" aria-live="polite">{selectionHint}</p> : null}
        <div className="artist-filter-panel__actions">
          <button type="button" className="artist-filter-panel__reset" onClick={onReset}>{resetLabel}</button>
          <button type="button" className="artist-filter-panel__apply" onClick={onApply} disabled={applyDisabled}>{applyLabel}</button>
        </div>
      </aside>
    </>
  );

  return typeof document === "undefined"
    ? panelLayer
    : createPortal(belowHeader ? <div className={`meewav-filter-below-header${open ? " is-open" : ""}`} style={boundaryStyle}>{panelLayer}</div> : dockRight ? <div className={`meewav-filter-dock${open ? " is-open" : ""}`} style={boundaryStyle}>{panelLayer}</div> : panelLayer, document.body);
}

export function MeewavFilterSection({
  label,
  summary,
  children,
}: {
  label: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="artist-filter-panel__group" aria-label={label}>
      <div className="artist-filter-panel__groupHeader">
        <span>{label}</span>
        {summary ? <small>{summary}</small> : null}
      </div>
      {children}
    </section>
  );
}

export type MeewavIllustratedFilterOption<Id extends string> = {
  id: Id;
  label: string;
  imageUrl: string;
  count?: number;
  state?: "default" | "limit-reached" | "paused";
  ariaLabel?: string;
  title?: string;
};

/**
 * Shared illustrated multi-select used by the Globe and feature filters.
 * The artwork is decorative: the option label and pressed state carry the
 * complete accessible meaning.
 */
export function MeewavIllustratedFilterGrid<Id extends string>({
  ariaLabel,
  options,
  selectedIds,
  onToggle,
}: {
  ariaLabel: string;
  options: readonly MeewavIllustratedFilterOption<Id>[];
  selectedIds: readonly Id[];
  onToggle: (id: Id) => void;
}) {
  return (
    <div
      className="artist-filter-panel__options artist-filter-panel__options--roles meewav-illustrated-filter-grid"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = selectedIds.includes(option.id);
        const stateClass = option.state === "limit-reached"
          ? " is-limit-reached"
          : option.state === "paused"
            ? " is-paused"
            : "";
        return (
          <button
            key={option.id}
            type="button"
            className={`artist-filter-option${active ? " is-active" : ""}${stateClass}`}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            onClick={() => onToggle(option.id)}
          >
            <span className="artist-filter-option__avatar" aria-hidden="true">
              <img
                src={option.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              <span className="artist-filter-option__check" />
            </span>
            <span className="artist-filter-option__label">{option.label}</span>
            {typeof option.count === "number" ? (
              <span className="artist-filter-option__count">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type MeewavActiveFilter = { id: string; label: string; onRemove: () => void };

export function MeewavActiveFilterChips({
  filters,
  onClear,
}: {
  filters: readonly MeewavActiveFilter[];
  onClear: () => void;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="artist-filter-active-chips" aria-label="Filtres actifs">
      {filters.map((filter) => (
        <button key={filter.id} type="button" className="artist-filter-active-chip" onClick={filter.onRemove}>
          <span>{filter.label}</span><X size={13} aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="artist-filter-active-chips__reset" onClick={onClear}>Tout effacer</button>
    </div>
  );
}
