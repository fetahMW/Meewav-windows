import { Check, LoaderCircle, MessageCircleMore, Plus, Search, UserRoundSearch, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { messagingRepository } from "../../messaging/messaging.service";
import type { MessageableProfileRow, MessagingConversationRow } from "../../messaging/messaging.types";

type InviteProfile = {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string;
  detail: string;
};

function contactProfile(row: MessagingConversationRow): InviteProfile | null {
  if (row.kind !== "direct" || !row.counterpart_profile_id) return null;
  return {
    id: row.counterpart_profile_id,
    displayName: row.counterpart_display_name || row.counterpart_username || "Contact MeeWav",
    username: row.counterpart_username,
    avatarUrl: row.counterpart_avatar_url || "/avatars/utilisateur.png",
    detail: "Contact de la messagerie",
  };
}

function searchProfile(row: MessageableProfileRow): InviteProfile {
  return {
    id: row.profile_id,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url || "/avatars/utilisateur.png",
    detail: row.primary_role_key || "Profil MeeWav",
  };
}

export default function PlaceGuestInvitePicker({

  excludedProfileIds,
  onInvite,
}: {
  excludedProfileIds: ReadonlySet<string>;

  onInvite: (profileId: string) => Promise<void>;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"contacts" | "search">("contacts");
  const [contacts, setContacts] = useState<InviteProfile[]>([]);
  const [results, setResults] = useState<InviteProfile[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});

  const placePanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(344, window.innerWidth - 24);
    const height = Math.min(430, window.innerHeight - 24);
    setPosition({
      width,
      maxHeight: height,
      left: Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width)),
      top: Math.max(12, Math.min(window.innerHeight - height - 12, rect.bottom + 8)),
    });
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await messagingRepository.listConversations({ kinds: ["direct"], limit: 50 });
      const profiles = rows.map(contactProfile).filter((item): item is InviteProfile => Boolean(item));
      setContacts(profiles.filter((item, index) => profiles.findIndex((row) => row.id === item.id) === index));
    } catch {
      setError("Les contacts ne sont pas disponibles pour le moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    placePanel();
    void loadContacts();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", placePanel);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [loadContacts, open, placePanel]);

  useEffect(() => {
    if (!open || source !== "search" || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void messagingRepository.searchMessageableProfiles(query.trim(), 30)
        .then((rows) => { if (current) setResults(rows.map(searchProfile)); })
        .catch(() => { if (current) setError("La recherche MeeWav est momentanément indisponible."); })
        .finally(() => { if (current) setLoading(false); });
    }, 260);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, query, source]);

  const visible = useMemo(() => (source === "contacts" ? contacts : results)
    .filter((profile) => !excludedProfileIds.has(profile.id)), [contacts, excludedProfileIds, results, source]);

  const invite = async (profileId: string) => {
    if (busyId || sentIds.has(profileId)) return;
    setBusyId(profileId);
    setError(null);
    try {
      await onInvite(profileId);
      setSentIds((current) => new Set(current).add(profileId));
    } catch {
      setError("Cette invitation n’a pas pu être envoyée.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button ref={triggerRef} type="button" className="place-guests__add-contact" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <Plus aria-hidden="true" /><span>Ajouter</span>
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <aside ref={panelRef} className="place-guests-invite is-lacquer" style={position} role="dialog" aria-label="Ajouter un invité à la Room">
          <header><span><small>INVITATION ROOM</small><strong>Ajouter un contact</strong><em>Messagerie ou recherche MeeWav</em></span><button type="button" onClick={() => setOpen(false)} aria-label="Fermer"><X /></button></header>
          <nav aria-label="Source du contact"><button type="button" className={source === "contacts" ? "is-active" : ""} onClick={() => setSource("contacts")}><MessageCircleMore /> Messagerie</button><button type="button" className={source === "search" ? "is-active" : ""} onClick={() => setSource("search")}><Search /> Rechercher</button></nav>
          {source === "search" ? <label><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Nom ou @identifiant…" autoFocus /></label> : null}
          <div className="place-guests-invite__list">
            {loading ? <p><LoaderCircle className="is-spinning" /> Chargement…</p> : null}
            {!loading && visible.map((profile) => {
              const sent = sentIds.has(profile.id);
              return <button type="button" key={profile.id} disabled={Boolean(busyId) || sent} onClick={() => void invite(profile.id)}><img src={profile.avatarUrl} alt="" /><span><strong>{profile.displayName}</strong><small>{profile.username ? `@${profile.username}` : profile.detail}</small></span>{sent ? <Check /> : busyId === profile.id ? <LoaderCircle className="is-spinning" /> : <Plus />}</button>;
            })}
            {!loading && visible.length === 0 ? <p><UserRoundSearch />{source === "search" && query.trim().length < 2 ? "Écris au moins deux caractères." : "Aucun profil disponible ici."}</p> : null}
          </div>
          {error ? <p className="place-guests-invite__error" role="alert">{error}</p> : null}
        </aside>, document.body) : null}
    </>
  );
}
