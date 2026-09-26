import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Crosshair, EyeOff, MapPin, Minus, Plus, X, Orbit, ArrowLeft, ArrowRight, Hand, MoveVertical, MousePointer2 } from "lucide-react";
import GlobeNavigationPole from "./GlobeNavigationPole";
import NationalTopTen from "./NationalTopTen";
import { RingPreProfileBoundary } from "./RingPreProfileBoundary";
import { MeewavSearchFilterBar, MeewavFilterPanel, MeewavIllustratedFilterGrid } from "./reference/components/shared/search-filter/MeewavSearchFilter";
import { GLOBE_ARTIST_ROLE_OPTIONS } from "./reference/components/shared/avatar/profileIconCatalog";
import { MeewavGradeBadge } from "./reference/features/grades/MeewavGradeBadge";
import { getGradeBadgeMeta } from "./reference/features/grades/gradeBadges";
import { targetFor } from "./geo.mjs";
import { EIFFEL, MONTPARNASSE, NEGRESCO, CITY_LANDMARKS } from "./eiffel-landmark.mjs";
import { CHARONNE_ID } from "./navigation-presets.mjs";
import meewavBrandLogo from "../../assets/ui/assets/meewav-logo.svg";
import { openLiveProfile } from './host-bridge';
import "./globe-interface.css";
import "./reference/features/globe/styles/globe-v2.css";

// esbuild emits the SVG beside this module, not beside the HTML page.
const meewavBrandLogoUrl = new URL(meewavBrandLogo, import.meta.url).href;
const RingArtistPreProfile = lazy(() => import("./RingArtistPreProfile"));
const GroundArtistPreProfile = lazy(() => import("./GroundArtistPreProfile"));

const normalise = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const defaultCities = ["Paris", "Nice", "Marseille", "Lyon", "Nantes", "Lille"];
const roleIds = GLOBE_ARTIST_ROLE_OPTIONS.map(role => role.key);
const defaultFilters = { roles: roleIds as string[], grades: [] as number[], hideConsulted: false };
const load = (key: string, fallback: any) => { try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch { return fallback; } };
const persist = (key: string, value: any) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Optional local preferences. */ } };
const names: Record<string, string> = { "/messages": "Messagerie", "/rooms/home": "Rooms", "/scene": "La Scène", "/market": "Marketplace", "/tremplin": "Tremplin", "/profile": "Profil" };

export function GlobeInterface({ ready, data, engine, navigate, selection, zoomLimit }: any) {
  const realMode = new URLSearchParams(location.search).get('mode') === 'real';
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mode, setMode] = useState<"globe" | "city" | "country" | "position" | "ring">("globe");
  const [ringReturning, setRingReturning] = useState(false);
  const [ringPortrait, setRingPortrait] = useState<any>(null);
  const [groundAvatar, setGroundAvatar] = useState<any>(null);
  const [activeCity, setActiveCity] = useState("Paris");
  const activeCityId = useRef("fr-commune-75056");
  const overviewPose = useRef<any>(null);
  const [notice, setNotice] = useState("");
  const [destination, setDestination] = useState("");
  const [cities, setCities] = useState<string[]>(() => {
    const stored = load("globelab.favoriteCities.v1", defaultCities);
    return Array.isArray(stored) && stored.length === 6 && stored.every(x => typeof x === "string") ? stored : defaultCities;
  });
  const [applied, setApplied] = useState(() => {
    const stored = load("globelab.artistFilters.v1", defaultFilters);
    return { roles: Array.isArray(stored.roles) ? stored.roles.filter((id: string) => roleIds.includes(id as any)) : roleIds,
      grades: Array.isArray(stored.grades) ? stored.grades.filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 6) : [],
      hideConsulted: stored.hideConsulted === true };
  });
  const [draft, setDraft] = useState(applied);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cityLabels = useMemo(() => data?.cities || (data?.labels || []).filter((x: any) => x.kind === "city"), [data]);
  const catalogue = useMemo(() => {
    if (!data) return [];
    const features = [...data.regions.features, ...data.sectors.features.filter((x: any) => x.properties.kind === "quartier")];
    return [
      { id: "eiffel", name: "Tour Eiffel", subtitle: "Gros-Caillou · Paris", target: { lon: EIFFEL.lon, lat: EIFFEL.lat, height: 0.02, pitch: 60, bearing: -35 } },
      { id: "montparnasse", name: "Tour Montparnasse", subtitle: "Necker · Paris", target: { lon: MONTPARNASSE.lon, lat: MONTPARNASSE.lat, height: 0.018, pitch: 60, bearing: -35 } },
      { id: 'negresco', name: 'Le Negresco', subtitle: 'Monument · Promenade des Anglais · Nice',
        landmark: true, cityCode: NEGRESCO.cityCode, quarterId: NEGRESCO.quartierId,
        target: { lon: NEGRESCO.lon, lat: NEGRESCO.lat, height: 0.006, pitch: 62, bearing: -20, landmarkFlight: true } },
      ...CITY_LANDMARKS.map((item: any) => ({
        id: `landmark-${item.id}`, name: item.name, subtitle: `Monument · ${item.city}`,
        landmark: true, cityCode: item.cityCode, quarterId: item.quartierId,
        target: { lon: item.lon, lat: item.lat, height: item.searchHeight,
          pitch: 62, bearing: -item.bearing - 20, landmarkFlight: true },
      })),
      { id: "france", name: "France", subtitle: "Pays", target: { lon: 2.4, lat: 46.6, height: 23 } },
      ...cityLabels.map((x: any) => ({ id: x.id, name: x.name, code: x.code || "", subtitle: `Commune${x.department ? ` · ${x.department}` : ""}`, city: true, rank: x.rank,
        target: { lon: x.center[0], lat: x.center[1], height: x.major ? 0.26 : 0.07, pitch: 0 } })),
      ...(data.quarterIndex?.labels || []).map((q: any) => ({ id: q.id, name: q.name, subtitle: `Quartier · ${q.cityName}`,
        rank: 4, quarter: true, cityCode: q.cityCode,
        target: { lon: q.center[0], lat: q.center[1], pitch: 0,
          height: Math.max(0.006, Math.max((q.bounds[2] - q.bounds[0]) * Math.cos(q.center[1] * Math.PI / 180), q.bounds[3] - q.bounds[1]) * Math.PI / 180 * 100 * 1.65) } })),
      ...features.map((f: any) => ({ id: f.id, name: f.properties.name, subtitle: f.properties.kind === "region" ? "Région" : f.properties.kind === "quartier" ? "Quartier · Paris" : "Commune",
        code: f.properties.code || f.properties.sourceCode || "", feature: f })),
    ].map((item: any) => ({ ...item, searchName: normalise(item.name).replace(/[-’']/g, " "), searchKey: normalise(`${item.name} ${item.code || ""} ${item.subtitle || ""}`).replace(/[-’']/g, " ") }));
  }, [data, cityLabels]);
  const placeResults = useMemo(() => {
    const needle = normalise(query.trim()).replace(/[-’']/g, " ");
    if (!needle) return [];
    return catalogue.filter((x: any) => needle.split(/\s+/).every(term => x.searchKey.includes(term)))
      .sort((a: any, b: any) => Number(b.searchName === needle || b.code === needle) - Number(a.searchName === needle || a.code === needle)
        || Number(b.searchName.startsWith(needle)) - Number(a.searchName.startsWith(needle)) || (a.rank || 1) - (b.rank || 1))
      .slice(0, 8);
  }, [query, catalogue]);
  const [avatarHits, setAvatarHits] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    setAvatarHits([]);
    if (!ready || !focused || query.trim().length < 2) {
      if (ready) engine.current?.searchAvatars('');
      return;
    }
    // Search is asynchronous and never runs inside React's render function.
    const currentEngine = engine.current;
    const timer = setTimeout(() => {
      Promise.resolve(currentEngine?.searchAvatars(query) || []).then(hits => {
        if (!cancelled) setAvatarHits(hits);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      currentEngine?.searchAvatars('');
    };
  }, [ready, focused, query, applied, engine]);
  const results = [...avatarHits, ...placeResults.filter((item: any) => !avatarHits.some((hit: any) => hit.id === item.id))].slice(0, 8);
  const showResults = focused && query.trim().length > 0;
  const count = roleIds.length - applied.roles.length + applied.grades.length + Number(applied.hideConsulted);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("meewav:filters-change", { detail: applied }));
  }, [applied]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => { if (destination && !dialog.current?.open) dialog.current?.showModal(); }, [destination]);
  const resolveCurrentCity = () => {
    const current = engine.current;
    const remembered = cityLabels.find((city: any) => city.id === activeCityId.current);
    if (!current) return remembered;
    const view = current.getView();
    const preset = overviewPose.current;
    if (preset && (current.isMoving() || (Math.abs(view.lon - preset.lon) < 0.00001 && Math.abs(view.lat - preset.lat) < 0.00001 && view.height > 8))) return remembered;
    return current.getCityAtView() || remembered;
  };
  const rememberCity = (city: any) => {
    if (!city) return;
    activeCityId.current = city.id;
    setActiveCity(city.name);
  };
  const closeRingPortrait = () => {
    engine.current?.closeRingPortrait();
    setRingPortrait(null);
  };
  const closeGroundAvatar = () => {
    engine.current?.closeGroundAvatar();
    setGroundAvatar(null);
  };
  const choose = (result: any) => {
    if (!result || !ready) return;
    closeGroundAvatar();
    if (result.avatar) {
      const quarter = data.sectors.features.find((feature: any) => feature.id === result.zoneId);
      const commune = data.communes?.features?.find((feature: any) => feature.id === result.zoneId);
      const feature = quarter || commune || null;
      overviewPose.current = null;
      navigate(feature, result.target, quarter
        ? { cityCode: "75056", quarterId: quarter.id }
        : commune ? { cityCode: String(commune.id).replace("fr-commune-", "") } : undefined);
      rememberCity(cityLabels.find((city: any) => city.id === (result.cityId || "fr-commune-75056")));
      setMode("city");
      setQuery(result.name); setFocused(false); setNotice(""); inputRef.current?.blur();
      return;
    }
    const target = result.id === "france" ? { ...engine.current.getOverviewTarget("country"), countryFlight: true } : result.target || targetFor(result.feature);
    if (result.id === "france") rememberCity(resolveCurrentCity());
    overviewPose.current = result.id === "france" ? target : null;
    navigate(result.feature || null, target, result.city ? { cityCode: result.code }
      : result.landmark ? { cityCode: result.cityCode, quarterId: result.quarterId }
      : result.quarter ? { cityCode: result.cityCode, quarterId: result.id } : undefined);
    if (result.city) { rememberCity(result); setMode("city"); }
    else setMode(result.landmark || result.quarter || result.feature?.properties.kind === "quartier" || result.id === "eiffel" || result.id === "montparnasse" ? "city" : "country");
    if (result.quarter || result.landmark) rememberCity(cityLabels.find((city: any) => city.code === result.cityCode));
    setQuery(result.name); setFocused(false); setNotice(""); inputRef.current?.blur();
  };
  const goCity = (name: string) => choose(catalogue.find((x: any) => x.city && x.name === name));
  const goCurrentCity = () => {
    const city = resolveCurrentCity();
    if (city) choose(catalogue.find((item: any) => item.city && item.id === city.id));
  };
  useEffect(() => {
    const selectCity = (event: Event) => {
      const id = (event as CustomEvent).detail?.id;
      choose(catalogue.find((item: any) => item.city && item.id === id));
    };
    window.addEventListener("meewav:city-select", selectCity);
    return () => window.removeEventListener("meewav:city-select", selectCity);
  }, [catalogue, ready]);
  const goGlobe = () => {
    if (!ready) return;
    if (engine.current.getRingNavigationState().active) {
      engine.current.exitRing(); setQuery(''); setFocused(false); setNotice(''); return;
    }
    rememberCity(resolveCurrentCity());
    const target = engine.current.getOverviewTarget("globe");
    overviewPose.current = target;
    navigate(null, target); setMode("globe"); setQuery(""); setFocused(false); setNotice("");
  };
  useEffect(() => {
    const changeMode = (event: Event) => {
      const active = (event as CustomEvent).detail.active;
      setMode(active ? 'ring' : 'globe');
      setRingReturning(Boolean((event as CustomEvent).detail.returning));
      setRingPortrait(null);
      setGroundAvatar(null);
      setFilterOpen(false); setFocused(false);
    };
    window.addEventListener('meewav:ring-mode', changeMode);
    return () => window.removeEventListener('meewav:ring-mode', changeMode);
  }, []);
  useEffect(() => {
    const selectPortrait = (event: Event) => setRingPortrait((event as CustomEvent).detail);
    window.addEventListener('meewav:ring-portrait-select', selectPortrait);
    return () => window.removeEventListener('meewav:ring-portrait-select', selectPortrait);
  }, []);
  useEffect(() => {
    const selectAvatar = (event: Event) => {
      const avatar = (event as CustomEvent).detail;
      if (realMode) { setGroundAvatar(null); if (avatar?.live) openLiveProfile(avatar.id); }
      else setGroundAvatar(avatar || null);
    };
    window.addEventListener('meewav:ground-avatar-select', selectAvatar);
    return () => window.removeEventListener('meewav:ground-avatar-select', selectAvatar);
  }, [realMode]);
  const goPosition = () => {
    if (!ready) return;
    const charonne = data.sectors.features.find((feature: any) => feature.id === CHARONNE_ID);
    if (!charonne) return;
    overviewPose.current = null;
    rememberCity(cityLabels.find((city: any) => city.id === "fr-commune-75056"));
    navigate(charonne, { ...targetFor(charonne), pitch: 0, bearing: 0 });
    setMode("position"); setQuery("Charonne"); setFocused(false); setNotice("");
  };
  const openDestination = (path: string) => {
    const event = new CustomEvent("meewav:navigate", { detail: { path }, cancelable: true });
    if (window.dispatchEvent(event)) setDestination(path);
  };
  const commitFilters = (next: typeof defaultFilters) => {
    setDraft(next);
    setApplied(next);
    persist("globelab.artistFilters.v1", next);
  };
  const toggleRole = (id: string) => commitFilters({ ...draft, roles: draft.roles.includes(id) ? draft.roles.filter((x: string) => x !== id) : [...draft.roles, id] });
  const toggleGrade = (level: number) => commitFilters({ ...draft, grades: draft.grades.includes(level) ? draft.grades.filter((x: number) => x !== level) : [...draft.grades, level] });
  const applyFilters = () => setFilterOpen(false);
  return <>
    {ready && !realMode && mode === 'globe' && <button className="ring-explore-button ring-key-surface" type="button"
      aria-label="Explorer les artistes légendaires" onClick={() => engine.current.enterRing()}>
      <Orbit className="ring-explore-icon" size={18} aria-hidden="true" />
      <span>Explorer les artistes<span className="ring-explore-detail"> légendaires</span></span>
    </button>}
    {mode === 'ring' && <>
      <button className="ring-return-button ring-key-surface" onClick={goGlobe} disabled={ringReturning}><ArrowLeft size={17} aria-hidden="true" />{ringReturning ? 'Retour au globe…' : 'Retour au globe'}</button>
      {!ringReturning && !ringPortrait && <section className="ring-visit-panel ring-key-surface" aria-label="Se déplacer sur l’anneau">
        <div className="ring-visit-main">
          <div className="ring-visit-gesture" aria-hidden="true"><ArrowLeft size={17} /><Hand size={26} strokeWidth={1.6} /><ArrowRight size={17} /></div>
          <div className="ring-visit-copy"><h2>Glissez à gauche ou à droite</h2><p>Explorez les artistes sur l’anneau</p></div>
        </div>
        <div className="ring-visit-hints">
          <span><MoveVertical size={13} aria-hidden="true" />Changer de rangée</span>
          <span><MousePointer2 size={13} aria-hidden="true" />Clic droit : regarder</span>
        </div>
      </section>}
      {!ringReturning && ringPortrait && <RingPreProfileBoundary key={ringPortrait.instanceId} onClose={closeRingPortrait}>
        <Suspense fallback={null}>
          <RingArtistPreProfile selection={ringPortrait} onClose={closeRingPortrait} />
        </Suspense>
      </RingPreProfileBoundary>}
    </>}
    {ready && mode !== "ring" && groundAvatar && <RingPreProfileBoundary key={groundAvatar.id} onClose={closeGroundAvatar}>
      <Suspense fallback={null}>
        <GroundArtistPreProfile selection={groundAvatar} onClose={closeGroundAvatar} />
      </Suspense>
    </RingPreProfileBoundary>}
    {ready && mode === "globe" && <div className="globe-honors-dock">
      <div className="globe-brand-logo-shell globe-brand-compact">
        <img className="globe-brand-logo" src={meewavBrandLogoUrl} alt="MeeWav" draggable={false} />
      </div>
      {new URLSearchParams(window.location.search).get('mode') !== 'real' ? <NationalTopTen /> : null}
    </div>}
    <aside className="reference-rail"><GlobeNavigationPole onGlobe={goGlobe} onNavigate={openDestination} /></aside>
    <header className="reference-search-dock" aria-label="Recherche sur le globe">
      <MeewavSearchFilterBar query={query} placement="flow" placeholder="Rechercher une ville ou un avatar..." inputAriaLabel="Rechercher un lieu ou un avatar"
        inputAriaKeyShortcuts="Control+k Meta+k" shortcutHint="⌘ / Ctrl K" inputRef={inputRef} filterTriggerRef={filterTrigger}
        onQueryChange={event => { setQuery(event.target.value); setActiveIndex(0); setFocused(true); }}
        onSubmit={event => { event.preventDefault(); choose(results[activeIndex] || results[0]); }} onInputFocus={() => setFocused(true)}
        onInputKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(i => Math.min(results.length - 1, i + 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
          if (event.key === "Escape") setFocused(false);
        }} onFormBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        onClear={() => { setQuery(""); setFocused(true); inputRef.current?.focus(); }}
        onToggleFilters={() => { if (!filterOpen) setDraft(applied); setFilterOpen(!filterOpen); setFocused(false); }}
        filterOpen={filterOpen} filterActive={count > 0} activeFilterCount={count} filterPanelId="artist-filter-drawer"
        expanded={showResults} suggestionListId="reference-search-results" activeDescendant={showResults && results[activeIndex] ? `result-${results[activeIndex].id}` : undefined} />
    </header>
      <nav className="reference-view-switch map-mode-switch" aria-label="Modes de carte">
        <button className={`map-mode-switch__button ${mode === "city" ? "is-active" : ""}`} disabled={!ready} onClick={goCurrentCity} aria-pressed={mode === "city"} title="Recentrer la ville explorée"><Building2 size={15} /><span>Ville</span></button>
        <button className={`map-mode-switch__button ${mode === "country" ? "is-active" : ""}`} disabled={!ready} onClick={() => choose(catalogue.find((x: any) => x.id === "france"))} aria-pressed={mode === "country"}><span className="map-mode-switch__france-flag" /><span>Pays</span></button>
        <button className={`map-mode-switch__button ${mode === "position" ? "is-active" : ""}`} disabled={!ready} onClick={goPosition} aria-label="Ma position fictive : Charonne, Paris" title="Position fictive — quartier Charonne, Paris" aria-pressed={mode === "position"}><Crosshair size={15} /><span>Ma position</span></button>
      </nav>
    <div className="reference-city-strip filter-chips" aria-label="Villes rapides">
      {cities.map((city, i) => <button key={i} disabled={!ready} className={`filter-chip ${mode === "city" && activeCity === city ? "is-active" : ""}`} onClick={() => goCity(city)}>{city}</button>)}
    </div>
    {showResults && <div id="reference-search-results" className="reference-search-results france-search-dropdown" role="listbox">
      {results.map((result: any, i: number) => <button key={result.id} id={`result-${result.id}`} role="option" aria-selected={i === activeIndex} className={i === activeIndex ? "is-active" : ""}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(i)} onClick={() => choose(result)}><MapPin size={17} /><span><strong>{result.name}</strong><small>{result.subtitle}</small></span></button>)}
      {!results.length && <p>Aucun lieu ni avatar trouvé.</p>}
    </div>}
    <MeewavFilterPanel open={filterOpen} panelId="artist-filter-drawer" eyebrow="Exploration personnalisée" title="Filtres artistes" description="Sélection des styles d’avatar"
      onClose={() => setFilterOpen(false)} onReset={() => commitFilters(defaultFilters)} onApply={applyFilters} resetLabel="Recomposer ma sélection" applyDisabled={!draft.roles.length} triggerRef={filterTrigger}
      belowHeader leftBoundarySelector=".meewav-primary-nav" selectionHint="Les avatars se mettent à jour tout de suite sur la carte.">
      <p className="reference-empty-profiles">Les avatars au sol de Paris, de Charonne et de la petite couronne suivent cette sélection.</p>
      <section className="artist-filter-history" aria-label="Profils déjà consultés"><div className="artist-filter-history__copy"><EyeOff size={18} /><span><strong>Masquer les profils déjà consultés</strong><small>Les profils épinglés restent visibles.</small></span></div>
        <button type="button" className={`artist-filter-history__toggle ${draft.hideConsulted ? "is-active" : ""}`} role="switch" aria-checked={draft.hideConsulted} aria-label="Masquer les profils déjà consultés" onClick={() => commitFilters({ ...draft, hideConsulted: !draft.hideConsulted })}><span /></button></section>
      <section className="artist-filter-panel__group" aria-label="Niveaux"><div className="artist-filter-panel__groupHeader"><span>Niveaux</span><small>{draft.grades.length || "Tous"}</small></div>
        <div className="artist-filter-panel__options artist-filter-panel__options--grades">{[1, 2, 3, 4, 5, 6].map(level => <button key={level} type="button" className={`artist-filter-grade ${draft.grades.includes(level) ? "is-active" : ""}`} aria-pressed={draft.grades.includes(level)} onClick={() => toggleGrade(level)}><MeewavGradeBadge level={level} size="sm" variant="icon" /><span><strong>{getGradeBadgeMeta(level as any).label}</strong><small>Niveau {level}</small></span></button>)}</div>
      </section>
      <section className="artist-filter-panel__group" aria-label="Styles d’avatar"><div className="artist-filter-panel__groupHeader"><span>Styles d’avatar <small>{draft.roles.length} / {roleIds.length}</small></span><button className="artist-filter-bulk-toggle" aria-pressed={draft.roles.length === roleIds.length} onClick={() => commitFilters({ ...draft, roles: draft.roles.length === roleIds.length ? [] : roleIds })}>{draft.roles.length === roleIds.length ? "Tout désélectionner" : "Tout sélectionner"}</button></div>
        <MeewavIllustratedFilterGrid ariaLabel="Sélection multiple des styles d’avatar" options={GLOBE_ARTIST_ROLE_OPTIONS.map(role => ({ id: role.key, label: role.label, imageUrl: role.imageUrl }))} selectedIds={draft.roles} onToggle={toggleRole} />
      </section>
      <section className="artist-filter-panel__group" aria-label="Villes favorites"><div className="artist-filter-panel__groupHeader"><span>Mes villes rapides</span><small>6 favoris</small></div>
        {cities.map((city, index) => <label className="reference-favorite-city" key={index}><span>Ville {index + 1}</span><select value={city} onChange={event => { const next = cities.map((c, i) => i === index ? event.target.value : c); setCities(next); persist("globelab.favoriteCities.v1", next); }}>
          {cityLabels.filter((c: any) => c.major || cities.includes(c.name)).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>)}
      </section>
    </MeewavFilterPanel>
    <div className="map-control-stack reference-controls" aria-label="Commandes de carte">
      <button className="map-control-button map-control-button--perspective ring-key-surface" disabled={!ready} title="Vue 3D / dessus" aria-label="Basculer vue du dessus et vue 3D" onClick={() => { const view = engine.current.getView(); engine.current.flyTo({ ...view, pitch: view.pitch > 5 ? 0 : 60 }, 0); }}>3D</button>
      <div className="map-control-group map-control-group--zoom"><button className="map-control-button" aria-label="Zoomer" disabled={!ready || zoomLimit === "near"} onClick={() => engine.current.zoom(0.55)}><Plus size={18} /></button><button className="map-control-button" aria-label="Dézoomer" disabled={!ready || zoomLimit === "far"} onClick={() => engine.current.zoom(1.8)}><Minus size={18} /></button></div>
    </div>
    {selection && <div className="reference-selection" role="status">{selection.properties.name}</div>}
    {notice && <div className="reference-notice" role="status">{notice}<button aria-label="Fermer le message" onClick={() => setNotice("")}><X size={16} /></button></div>}
    <dialog ref={dialog} className="reference-destination" onClose={() => setDestination("")}><button className="reference-dialog-close" aria-label="Fermer" onClick={() => dialog.current?.close()}><X size={20} /></button><h2>{names[destination] || "MeeWav"}</h2><p>Cet espace de votre application n’est pas encore relié à ce globe.</p><button onClick={() => dialog.current?.close()}>Revenir à la carte</button></dialog>
  </>;
}
