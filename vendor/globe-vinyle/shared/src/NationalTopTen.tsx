import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Crown, Sparkles } from "lucide-react";
import { SCENE_DEMO_ARTISTS } from "./reference/features/shorts/sceneArtistPortraits";
import { RingPreProfileBoundary } from "./RingPreProfileBoundary";
import "./national-top-ten.css";

const ArtistPreProfile = lazy(() => import("./RingArtistPreProfile"));

// Editorial demo order, independent of grades and of the map's active filters.
// Replace this fixture when the national ranking service is connected.
const DEMO_ORDER = ["NOVA KEYS", "MALIK NOX", "JUNE VELVET", "NAYA K.", "KORA N.",
  "AMIRA SEN", "ELIO M.", "SAYA RHYTHM", "TESSA WAVE", "INES K."];
const ARTISTS = DEMO_ORDER.flatMap(name => {
  const artist = SCENE_DEMO_ARTISTS.find(item => item.name === name);
  if (!artist) return [];
  const file = artist.portrait.split("/").pop()!;
  return [{ ...artist, slug: file.replace(/\.webp$/, ""),
    portraitUrl: new URL(`ui/ring-portraits/${file}`, document.baseURI).href }];
});

export default function NationalTopTen() {
  const panel = useRef<HTMLElement>(null);
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<any>(null);
  useEffect(() => {
    // The engine also hides the globe branding through CSS while zooming or
    // flying, without unmounting React. Every new appearance starts folded.
    const globe = panel.current?.closest(".immersive-globe");
    if (!globe) return;
    const observer = new MutationObserver(() => {
      setExpanded(false);
      setSelection(null);
    });
    observer.observe(globe, { attributes: true, attributeFilter: ["data-globe-brand-visible"] });
    return () => observer.disconnect();
  }, []);
  const close = () => setSelection(null);
  const open = (artist: typeof ARTISTS[number], rank: number, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setSelection({ ...artist, instanceId: rank, anchor: {
      x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      clearance: rect.width / 2, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    } });
  };

  return <>
    <section ref={panel} className="national-top-ten ring-key-surface" data-expanded={expanded} aria-labelledby="national-top-ten-title">
      <header className="national-top-ten__header">
        <h2 id="national-top-ten-title">
          <button type="button" className="national-top-ten__toggle" aria-expanded={expanded} aria-controls={contentId}
            onClick={() => { setExpanded(value => !value); setSelection(null); }}>
            <Crown className="national-top-ten__emblem" size={19} strokeWidth={1.6} aria-hidden="true" />
            <span className="national-top-ten__heading">Top 10 MeeWav France<small>Toutes catégories confondues</small></span>
            <ChevronDown className="national-top-ten__chevron" size={17} aria-hidden="true" />
          </button>
        </h2>
      </header>
      <div id={contentId} className="national-top-ten__content" hidden={!expanded}>
      {expanded && <>
      <ol className="national-top-ten__list" aria-label="Top 10 national de démonstration">
        {ARTISTS.map((artist, index) => <li key={artist.artistId} className={index === 0 ? "is-champion" : index < 3 ? "is-podium" : ""}>
          <button type="button" className="national-top-ten__artist"
            onClick={event => open(artist, index + 1, event.currentTarget)}
            aria-label={`Numéro ${index + 1}, ${artist.name}, ${artist.role}, ${artist.city}. Ouvrir le pré-profil`}>
            <span className="national-top-ten__rank" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="national-top-ten__portrait">
              <img src={artist.portraitUrl} alt="" width={64} height={64} decoding="async" draggable={false} />
              {index === 0 && <span className="national-top-ten__crown"><Crown size={11} strokeWidth={1.7} /></span>}
            </span>
            <span className="national-top-ten__identity">
              {index === 0 && <span className="national-top-ten__number-one">N° 1 NATIONAL</span>}
              <strong>{artist.name}</strong>
              <span className="national-top-ten__detail">{artist.role.split(" · ")[0]} <b>·</b> {artist.city}</span>
            </span>
            <ArrowUpRight className="national-top-ten__open" size={13} aria-hidden="true" />
          </button>
        </li>)}
      </ol>
      <footer className="national-top-ten__footer">
        <p><Sparkles size={13} aria-hidden="true" />Et si la prochaine place était la vôtre ?</p>
        <span>Classement de démonstration</span>
      </footer>
      </>}
      </div>
    </section>
    {selection && <RingPreProfileBoundary key={selection.artistId} onClose={close}>
      <Suspense fallback={null}><ArtistPreProfile selection={selection} onClose={close} /></Suspense>
    </RingPreProfileBoundary>}
  </>;
}
