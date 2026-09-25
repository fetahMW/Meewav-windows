import { Search, SmilePlus, X } from "lucide-react";
import {
  Fragment,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import manifestJson from "./meewav-emoticons.manifest.json";
import manifestV2Json from "./meewav-emoticons-v2.manifest.json";
import manifestV3Json from "./meewav-emoticons-v3.manifest.json";
import manifestV4Json from "./meewav-emoticons-v4.manifest.json";
import manifestV5Json from "./meewav-emoticons-v5.manifest.json";
import manifestV6Json from "./meewav-emoticons-v6.manifest.json";
import "./meewav-emoticons.css";

type ManifestItem = {
  id: number;
  name: string;
  label: string;
  category: string;
  keywords?: string[];
  tags?: string[];
};

type Manifest = {
  name?: string;
  version?: string;
  count: number;
  items: ManifestItem[];
};

const manifest = manifestJson as Manifest;
const manifestV2 = manifestV2Json as Manifest;
const manifestV3 = manifestV3Json as Manifest;
const manifestV4 = manifestV4Json as Manifest;
const manifestV5 = manifestV5Json as Manifest;
const manifestV6 = manifestV6Json as Manifest;
const TOKEN_PATTERN = /\[\[mw:([a-z0-9-]+)\]\]/giu;
type CatalogItem = ManifestItem & {
  assetName: string;
  assetPath: string;
  pack: "v1" | "v2" | "v3" | "v4" | "v5" | "v6";
};

const catalog: CatalogItem[] = [
  ...manifest.items.map((item) => ({
    ...item,
    assetName: item.name,
    assetPath: `/meewav-emojis/webp/256/${item.name}.webp`,
    pack: "v1" as const,
  })),
  ...manifestV2.items.map((item) => ({
    ...item,
    name: `v2-${item.name}`,
    assetName: item.name,
    assetPath: `/meewav-emojis/v2/webp/256/${item.name}.webp`,
    pack: "v2" as const,
  })),
  ...manifestV3.items.map((item) => ({ ...item, keywords: item.keywords ?? item.tags, name: `v3-${item.name}`, assetName: item.name, assetPath: `/meewav-emojis/v3/webp/256/${item.name}.webp`, pack: "v3" as const })),
  ...manifestV4.items.map((item) => ({ ...item, keywords: item.keywords ?? item.tags, name: `v4-${item.name}`, assetName: item.name, assetPath: `/meewav-emojis/v4/webp/256/${item.name}.webp`, pack: "v4" as const })),
  ...manifestV5.items.map((item) => ({ ...item, keywords: item.keywords ?? item.tags, name: `v5-${item.name}`, assetName: item.name, assetPath: `/meewav-emojis/v5/webp/256/${item.name}.webp`, pack: "v5" as const })),
  ...manifestV6.items.map((item) => ({ ...item, keywords: item.keywords ?? item.tags, name: `v6-${item.name}`, assetName: item.name, assetPath: `/meewav-emojis/v6/webp/256/${item.name}.webp`, pack: "v6" as const })),
];
const itemsByName = new Map(catalog.map((item) => [item.name, item]));

export type MeeWavEmoticon = CatalogItem;
export type MeeWavEmoticonName = MeeWavEmoticon["name"];

export const MEEWAV_EMOTICONS = catalog as readonly MeeWavEmoticon[];

export function meewavEmoticonToken(name: MeeWavEmoticonName) {
  return `[[mw:${name}]]`;
}

export function appendMeeWavEmoticon(
  value: string,
  name: MeeWavEmoticonName,
  maxLength?: number,
) {
  const token = meewavEmoticonToken(name);
  const next = `${value}${value && !/\s$/u.test(value) ? " " : ""}${token}`;
  // An emoticon token is atomic. Returning a sliced token would leak its
  // internal syntax into chat and could never be rendered back as an image.
  return typeof maxLength === "number" && next.length > maxLength ? value : next;
}

export function MeewavEmoticonImage({
  name,
  size = 36,
  className,
  decorative = false,
}: {
  name: MeeWavEmoticonName;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const item = itemsByName.get(name);
  if (!item) return null;
  return (
    <img
      src={item.assetPath}
      alt={decorative ? "" : item.label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}

export function MeeWavRichText({
  children,
  emoticonSize = 30,
  className,
}: {
  children: string;
  emoticonSize?: number;
  className?: string;
}) {
  const content = useMemo(() => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    TOKEN_PATTERN.lastIndex = 0;
    while ((match = TOKEN_PATTERN.exec(children)) !== null) {
      if (match.index > cursor) nodes.push(children.slice(cursor, match.index));
      const item = itemsByName.get(match[1]);
      if (item) {
        nodes.push(
          <MeewavEmoticonImage
            key={`${match.index}-${item.name}`}
            name={item.name}
            size={emoticonSize}
            className="mw-rich-text__emoticon"
          />,
        );
      } else {
        nodes.push(match[0]);
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < children.length) nodes.push(children.slice(cursor));
    return nodes;
  }, [children, emoticonSize]);

  return <span className={`mw-rich-text${className ? ` ${className}` : ""}`}>{content.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</span>;
}

function composerValue(root: HTMLElement) {
  let value = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const token = node.dataset.mwEmoticonToken;
    if (token) {
      value += token;
      return;
    }
    if (node.tagName === "BR") {
      value += "\n";
      return;
    }
    const block = node !== root && (node.tagName === "DIV" || node.tagName === "P");
    if (block && value && !value.endsWith("\n")) value += "\n";
    node.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return value.replace(/\u00a0/gu, " ");
}

function renderComposerValue(root: HTMLElement, value: string) {
  root.replaceChildren();
  let cursor = 0;
  let match: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) root.append(document.createTextNode(value.slice(cursor, match.index)));
    const item = itemsByName.get(match[1]);
    if (item) {
      const image = document.createElement("img");
      image.src = item.assetPath;
      image.alt = item.label;
      image.width = 28;
      image.height = 28;
      image.draggable = false;
      image.contentEditable = "false";
      image.dataset.mwEmoticonToken = match[0];
      image.className = "mw-emoticon-composer__image";
      root.append(image);
    } else {
      root.append(document.createTextNode(match[0]));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) root.append(document.createTextNode(value.slice(cursor)));
  root.dataset.empty = value ? "false" : "true";
}

export function MeeWavEmoticonComposer({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength,
  disabled = false,
  multiline = false,
  className,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
  disabled?: boolean;
  multiline?: boolean;
  className?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || composerValue(editor) === value) return;
    const focused = document.activeElement === editor;
    renderComposerValue(editor, value);
    if (focused) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      className={`mw-emoticon-composer${multiline ? " is-multiline" : ""}${className ? ` ${className}` : ""}`}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-multiline={multiline || undefined}
      tabIndex={disabled ? -1 : 0}
      data-placeholder={placeholder}
      data-empty={value ? "false" : "true"}
      onInput={(event) => {
        const next = composerValue(event.currentTarget);
        if (typeof maxLength === "number" && next.length > maxLength) {
          renderComposerValue(event.currentTarget, value);
          return;
        }
        event.currentTarget.dataset.empty = next ? "false" : "true";
        onChange(next);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== "Enter" || multiline || event.shiftKey) return;
        event.preventDefault();
        event.currentTarget.closest("form")?.requestSubmit();
      }}
    />
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "Tout",
  reaction: "Réactions",
  live: "Live",
  studio: "Studio",
  instrument: "Instruments",
  dj: "DJ",
  production: "Production",
  music: "Musique",
  digital: "Digital",
  community: "Communauté",
  creation: "Création",
  brand: "MeeWav",
  reward: "Récompenses",
  audio: "Audio",
  badge: "Badges",
  discovery: "Découverte",
  promotion: "Promo",
  video: "Vidéo",
  shorts: "Shorts",
  messaging: "Messages",
  collaboration: "Collab",
  announcement: "Annonce",
  dance: "Danse",
  performance: "Performance",
};

export function MeeWavEmoticonPicker({
  onSelect,
  disabled = false,
  label = "Ajouter une émoticône MeeWav",
  className,
  panelClassName,
  triggerIcon,
}: {
  onSelect: (emoticon: MeeWavEmoticon) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  panelClassName?: string;
  triggerIcon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const categories = useMemo(() => [
    "all",
    ...Array.from(new Set(MEEWAV_EMOTICONS.map((item) => item.category))),
  ], []);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return MEEWAV_EMOTICONS.filter((item) => (
      (category === "all" || item.category === category)
      && (!normalizedQuery || `${item.label} ${item.name} ${(item.keywords ?? []).join(" ")}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery))
    ));
  }, [category, query]);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(368, window.innerWidth - 24);
      const height = Math.min(418, window.innerHeight - 24);
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
      const top = rect.top >= height + 12
        ? rect.top - height - 8
        : Math.min(window.innerHeight - height - 12, rect.bottom + 8);
      setPosition({ left, top, width, maxHeight: height });
    };
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  return (
    <span className={`mw-emoticon-picker${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="mw-emoticon-picker__trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {triggerIcon ?? <SmilePlus aria-hidden="true" />}
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={panelRef}
          className={`mw-emoticon-wall${panelClassName ? ` ${panelClassName}` : ""}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          style={position}
        >
          <header className="mw-emoticon-wall__header">
            <span className="mw-emoticon-wall__mark"><MeewavEmoticonImage name="coeur-casque" size={42} decorative /></span>
            <span><small>PACKS OFFICIELS</small><strong id={titleId}>Mur d’émoticônes</strong><em>{MEEWAV_EMOTICONS.length} vibes musicales MeeWav</em></span>
            <button type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Fermer le mur d’émoticônes"><X aria-hidden="true" /></button>
          </header>
          <label className="mw-emoticon-wall__search">
            <Search aria-hidden="true" />
            <span className="sr-only">Rechercher une émoticône</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Rechercher une vibe…" autoFocus />
          </label>
          <nav className="mw-emoticon-wall__categories" aria-label="Catégories d’émoticônes">
            {categories.map((id) => <button type="button" key={id} className={category === id ? "is-active" : ""} aria-pressed={category === id} onClick={() => setCategory(id)}>{CATEGORY_LABELS[id] ?? id}</button>)}
          </nav>
          <div className="mw-emoticon-wall__grid" role="list" aria-label={`${filtered.length} émoticônes`}>
            {filtered.map((item) => (
              <button
                type="button"
                role="listitem"
                key={item.name}
                title={item.label}
                aria-label={item.label}
                onClick={() => {
                  onSelect(item);
                }}
              >
                <MeewavEmoticonImage name={item.name} size={54} decorative />
                <span>{item.label}</span>
              </button>
            ))}
            {filtered.length === 0 ? <p>Aucune vibe ne correspond.</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </span>
  );
}
