import { useEffect, useMemo, useState, type RefObject } from "react";
import { MeewavSearchFilterBar } from "../../components/shared/search-filter/MeewavSearchFilter";
import type { ShortsVideoItem } from "../shorts/shorts-wall-data";

type Props = { query: string; items: ShortsVideoItem[]; onSearch: (value: string) => void; onFilters: () => void; filtersOpen: boolean; filterCount: number; inputRef: RefObject<HTMLInputElement | null>; filterRef: RefObject<HTMLButtonElement | null> };
export default function SceneSearch({ query, items, onSearch, onFilters, filtersOpen, filterCount, inputRef, filterRef }: Props) {
  const [draft, setDraft] = useState(query), [debounced, setDebounced] = useState(query), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(draft), 250); return () => window.clearTimeout(timer); }, [draft]);
  const suggestions = useMemo(() => {
    const q = debounced.trim().toLocaleLowerCase("fr");
    if (q.length < 2) return [];
    return [...new Set(items.flatMap((item) => [item.title, item.artist]))].filter((label) => label.toLocaleLowerCase("fr").includes(q)).slice(0, 7);
  }, [items, debounced]);
  const search = (value = draft) => { setDraft(value); setOpen(false); setActive(-1); onSearch(value.trim()); };
  return <div className="scene-context-search">
    <MeewavSearchFilterBar placement="flow" query={draft} placeholder="Rechercher sur La Scène" inputAriaLabel="Rechercher dans La Scène" inputAriaKeyShortcuts="Control+K Meta+K"
      onQueryChange={(event) => { setDraft(event.target.value); setOpen(true); setActive(-1); }} onClear={() => { search(""); inputRef.current?.focus(); }}
      onSubmit={(event) => { event.preventDefault(); search(active >= 0 ? suggestions[active] : draft); }}
      onInputFocus={() => setOpen(true)} onFormBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false); }}
      onInputKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) { event.preventDefault(); setOpen(true); setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
      }} expanded={open && suggestions.length > 0} suggestionListId="scene-search-suggestions" activeDescendant={active >= 0 ? `scene-search-option-${active}` : undefined}
      onToggleFilters={onFilters} filterOpen={filtersOpen} filterActive={filterCount > 0} activeFilterCount={filterCount} filterPanelId="scene-filter-panel" inputRef={inputRef} filterTriggerRef={filterRef} />
    {open && suggestions.length > 0 && <div className="scene-search-suggestions" id="scene-search-suggestions" role="listbox" aria-label="Suggestions de recherche">{suggestions.map((label, index) => <button type="button" role="option" aria-selected={active === index} id={`scene-search-option-${index}`} key={label} onMouseDown={(event) => event.preventDefault()} onClick={() => search(label)}>{label}</button>)}</div>}
  </div>;
}
