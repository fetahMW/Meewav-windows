import {
  BadgeCheck,
  Gift,
  Heart,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export type GiftStatus = "Prêt" | "Programmé" | "Envoyé" | "Annulé";
export type GiftAction = "Envoyer maintenant" | "Programmer" | "Ajouter à une ronde";
export type RecipientSource = "Raccourci" | "Meewav";
export type GiftVisual = "card" | "pass" | "party" | "access" | "surprise" | "golden" | "patron" | "bonus" | "certif";
export type GiftRarity = "Essentiel" | "Rare" | "Épique" | "Légendaire";

export type GiftCatalogItem = {
  name: string;
  detail: string;
  availability: string;
  icon: LucideIcon;
  visual: GiftVisual;
  rarity: GiftRarity;
  tone: string;
  gold?: boolean;
};

export type GiftEntry = {
  id: string;
  gift: string;
  recipient: string;
  recipientSource: RecipientSource;
  action: GiftAction;
  status: GiftStatus;
  delivery: string;
  date: string;
  time: string;
  round: string;
};

export const PROFILE_GIFT_STORAGE_KEY = "meewav-profile-gifts-v3";
export const PROFILE_GIFT_STATUSES: GiftStatus[] = ["Prêt", "Programmé", "Envoyé", "Annulé"];
export const PROFILE_GIFT_ACTIONS: GiftAction[] = ["Envoyer maintenant", "Programmer", "Ajouter à une ronde"];
export const PROFILE_GIFT_RECIPIENT_SOURCES: RecipientSource[] = ["Raccourci", "Meewav"];

/**
 * Canonical gift inventory shared by Profile Studio and Rooms.
 * These are earned/community rewards: the product currently assigns no price
 * or currency to them. Monetary support stays in the separate Room hat flow.
 */
export const PROFILE_GIFT_CATALOG: GiftCatalogItem[] = [
  { name: "Distinction Live", detail: "Reconnaît la qualité de cette prestation précise, sans juger le talent général.", availability: "Disponible", icon: ShieldCheck, visual: "card", rarity: "Essentiel", tone: "#9859ff" },
  { name: "Pass VIP", detail: "Un pass prioritaire pour rejoindre la prochaine ronde.", availability: "3 restants", icon: TicketCheck, visual: "pass", rarity: "Rare", tone: "#3de2bd" },
  { name: "Wave Party", detail: "Une animation surprise à déclencher avec la communauté.", availability: "Disponible", icon: Sparkles, visual: "party", rarity: "Épique", tone: "#ef72e8" },
  { name: "Cadeau surprise", detail: "Un cadeau libre à nommer et illustrer avant de l’offrir.", availability: "Disponible", icon: Gift, visual: "surprise", rarity: "Rare", tone: "#4a9dff" },
  { name: "Supporter d’Or", detail: "Distingue la personne qui a apporté le soutien financier le plus important pendant la Room.", availability: "Disponible", icon: Trophy, visual: "patron", rarity: "Légendaire", tone: "#efb54a", gold: true },
  { name: "Bonus supporter", detail: "Un bonus emballé pour remercier une présence fidèle.", availability: "Disponible", icon: Heart, visual: "bonus", rarity: "Épique", tone: "#ff4f91" },
  { name: "La Certif", detail: "« Je valide ce talent » · une recommandation publique signée par l’expéditeur.", availability: "Disponible", icon: BadgeCheck, visual: "certif", rarity: "Épique", tone: "#35dcf4" },
];

/**
 * Rewards that remain meaningful in every Room format (Classe, Wave, Cage,
 * etc.). The Profile keeps its complete catalogue; Rooms deliberately omit
 * only the Wave-specific community animation.
 */
export const ROOM_STANDARD_GIFT_CATALOG: GiftCatalogItem[] = PROFILE_GIFT_CATALOG
  .filter((item) => item.name !== "Wave Party");

export const PROFILE_GIFT_SHORTCUTS = ["Maya", "Noa", "Kenza", "Ilyes", "Membres de ma wave"];
export const PROFILE_GIFT_MEEWAV_RECIPIENTS = ["Echo Flow", "Neon Pulse", "Stellar Vibe", "Lisa Music", "The Producer", "Vocal Queen"];
export const PROFILE_GIFT_ROUND_OPTIONS = ["Ronde actuelle", "Nouvelle ronde", "Fans récents", "Participants actifs"];

export const PROFILE_GIFT_INITIAL_ENTRIES: GiftEntry[] = [
  { id: "gift-patron-maya", gift: "Supporter d’Or", recipient: "Maya", recipientSource: "Raccourci", action: "Ajouter à une ronde", status: "Prêt", delivery: "Ronde", date: "", time: "", round: "Ronde actuelle" },
  { id: "gift-vip-noa", gift: "Pass VIP", recipient: "Noa", recipientSource: "Raccourci", action: "Programmer", status: "Programmé", delivery: "Vendredi 20:45", date: "2026-07-17", time: "20:45", round: "" },
  { id: "gift-force-kenza", gift: "Distinction Live", recipient: "Kenza", recipientSource: "Raccourci", action: "Envoyer maintenant", status: "Envoyé", delivery: "Aujourd’hui", date: "", time: "", round: "" },
];

export const PROFILE_GIFT_FALLBACK: GiftCatalogItem = {
  name: "Cadeau Meewav",
  detail: "Une attention préparée pour la communauté.",
  availability: "Disponible",
  icon: Gift,
  visual: "card",
  rarity: "Essentiel",
  tone: "#b889ff",
};

export function profileGiftToday() {
  return new Date().toISOString().slice(0, 10);
}

export function profileGiftDateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateProfileGiftSchedule(date: string, time: string) {
  if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return "Choisis une date et une heure valides";
  const scheduledAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return "La programmation doit être située dans le futur";
  return null;
}

export function profileGiftStatusForAction(action: GiftAction): GiftStatus {
  return action === "Envoyer maintenant" ? "Envoyé" : action === "Programmer" ? "Programmé" : "Prêt";
}

export function profileGiftDeliveryForAction(action: GiftAction, date: string, time: string, round: string) {
  return action === "Envoyer maintenant"
    ? "Aujourd’hui"
    : action === "Programmer"
      ? `${date.split("-").reverse().join("/")} · ${time}`
      : round;
}

export function profileGiftItemFor(name: string | null | undefined) {
  return PROFILE_GIFT_CATALOG.find((item) => item.name === name)
    ?? { ...PROFILE_GIFT_FALLBACK, name: name || PROFILE_GIFT_FALLBACK.name };
}

export function ProfileGiftObject({ item, compact = false }: { item: GiftCatalogItem; compact?: boolean }) {
  const Icon = item.icon;
  const size = compact ? 17 : 22;

  const customIcon = item.visual === "card" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><linearGradient id="profileGiftVioletStroke" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse"><stop stopColor="#eadfff" /><stop offset=".42" stopColor="#a267ff" /><stop offset="1" stopColor="#6d49ea" /></linearGradient></defs>
      <path d="M12 2.4c2.5 2 5.1 3 7.7 3.5v6.3c0 4.5-3 7.3-7.7 9.3-4.7-2-7.7-4.8-7.7-9.3V5.9C6.9 5.4 9.5 4.4 12 2.4Z" stroke="url(#profileGiftVioletStroke)" strokeWidth=".82" />
      <path d="M12 4.8c1.8 1.25 3.7 2 5.6 2.45v4.8c0 3.2-2 5.35-5.6 7.05-3.6-1.7-5.6-3.85-5.6-7.05v-4.8C8.3 6.8 10.2 6.05 12 4.8Z" strokeWidth=".5" opacity=".58" />
      <path d="m8.8 12.1 2.05 2.05 4.45-4.45" strokeWidth=".92" />
      <path d="M5.75 6.1c2.1-.48 4.35-1.42 6.18-2.72M7.25 8.02c1.62-.42 3.2-1.08 4.72-2.04" stroke="#fff" strokeWidth=".34" opacity=".82" />
      <path d="m9.18 12.1 1.67 1.67" stroke="#fff" strokeWidth=".38" opacity=".84" />
    </svg>
  ) : item.visual === "pass" ? (
    <svg viewBox="0 0 28 22" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><linearGradient id="profileGiftMintStroke" x1="4" y1="4" x2="24" y2="18" gradientUnits="userSpaceOnUse"><stop stopColor="#e2fff8" /><stop offset=".4" stopColor="#49edc7" /><stop offset="1" stopColor="#24aa91" /></linearGradient></defs>
      <path d="M3 4.25h22v4.1a2.65 2.65 0 0 0 0 5.3v4.1H3v-4.1a2.65 2.65 0 0 0 0-5.3v-4.1Z" stroke="url(#profileGiftMintStroke)" strokeWidth=".8" />
      <path d="M8.2 5.6v2m0 2.1v2m0 2.1v2.6" strokeWidth=".6" opacity=".72" />
      <path d="m17.05 7.1 1.05 2.15 2.35.34-1.7 1.65.4 2.33-2.1-1.1-2.1 1.1.4-2.33-1.7-1.65 2.35-.34 1.05-2.15Z" stroke="#dffff7" strokeWidth=".62" />
      <path d="m17.05 8.55-.3 2.35-1.8.55m1.8-.55 2.4 2.67m-2.4-2.67 2-1.15" strokeWidth=".38" opacity=".78" />
      <path d="M4.8 5.1h8.15M17.05 7.72l.76 1.55" stroke="#fff" strokeWidth=".32" opacity=".78" />
    </svg>
  ) : item.visual === "access" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><linearGradient id="profileGiftBlueStroke" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse"><stop stopColor="#e5f3ff" /><stop offset=".38" stopColor="#61b2ff" /><stop offset="1" stopColor="#377cf0" /></linearGradient></defs>
      <path d="M7.15 10V7.35a4.85 4.85 0 0 1 9.7 0V10" stroke="url(#profileGiftBlueStroke)" strokeWidth=".8" />
      <path d="M8.8 10V7.45a3.2 3.2 0 0 1 6.4 0V10" strokeWidth=".42" opacity=".58" />
      <rect x="3.65" y="9.75" width="16.7" height="11.35" rx="1.85" stroke="url(#profileGiftBlueStroke)" strokeWidth=".8" />
      <rect x="5.25" y="11.25" width="13.5" height="8.35" rx=".85" strokeWidth=".38" opacity=".48" />
      <circle cx="12" cy="14.65" r="1.35" stroke="#edf7ff" strokeWidth=".68" />
      <path d="M12 16v2.25" stroke="#d9edff" strokeWidth=".74" />
      <path d="M7.95 7.25A4.05 4.05 0 0 1 12 3.2M5.35 10.7h6.55" stroke="#fff" strokeWidth=".34" opacity=".82" />
    </svg>
  ) : item.visual === "golden" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id="profileGiftGoldStroke" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff8d7" />
          <stop offset=".24" stopColor="#ffd86b" />
          <stop offset=".54" stopColor="#bd7d20" />
          <stop offset=".78" stopColor="#fff0a0" />
          <stop offset="1" stopColor="#d8992c" />
        </linearGradient>
      </defs>
      <path d="m12 2.35 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 16.92l-5.7 2.99 1.09-6.35-4.62-4.5 6.38-.93L12 2.35Z" stroke="url(#profileGiftGoldStroke)" strokeWidth=".76" />
      <path d="m12 5.15-1.1 7.04L5.2 10.3m5.7 1.89L12 16.92m-1.1-4.73 6.08-2.36m-6.08 2.36 5.71 1.37" stroke="#e9aa3d" strokeWidth=".44" opacity=".74" />
      <path d="m12 7.8 2.55 3.62-.98 4.24L12 16.92l-1.57-1.26-.98-4.24L12 7.8Z" fill="currentColor" stroke="none" opacity=".075" />
      <path d="m12 7.8 2.55 3.62-2.55 1.17-2.55-1.17L12 7.8Z" strokeWidth=".34" opacity=".66" />
      <path d="m8.98 8.32 2.76-5.25 1.48 3.02M4.1 9.35l3.8-.55" stroke="#fff8dc" strokeWidth=".34" opacity=".82" />
    </svg>
  ) : item.visual === "bonus" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><linearGradient id="profileGiftPinkStroke" x1="6" y1="5" x2="18" y2="20" gradientUnits="userSpaceOnUse"><stop stopColor="#fff7fb" /><stop offset=".4" stopColor="#ff82b0" /><stop offset="1" stopColor="#ff3e88" /></linearGradient></defs>
      <path d="M20.6 8.35c0 5.08-4.45 8.15-8.6 11.1-4.15-2.95-8.6-6.02-8.6-11.1A4.76 4.76 0 0 1 12 5.52a4.76 4.76 0 0 1 8.6 2.83Z" stroke="url(#profileGiftPinkStroke)" strokeWidth=".76" />
      <path d="M20.6 8.35c0 5.08-4.45 8.15-8.6 11.1-4.15-2.95-8.6-6.02-8.6-11.1A4.76 4.76 0 0 1 12 5.52a4.76 4.76 0 0 1 8.6 2.83Z" strokeWidth=".38" opacity=".22" transform="translate(3 2.15) scale(.75)" />
      <path d="M7.15 6.1c1.2-.82 2.72-.83 4.05.05" strokeWidth=".42" opacity=".68" />
      <path d="M5.65 8.95c.22-1.3 1.18-2.38 2.48-2.7" stroke="#fff7fb" strokeWidth=".48" opacity=".88" />
      <path d="M9.2 17.45v3.15l2.8-1.55 2.8 1.55v-3.15" strokeWidth=".58" opacity=".72" />
      <path d="M6.05 8.15c.55-1.15 1.55-1.83 2.72-1.83" stroke="#fff" strokeWidth=".3" opacity=".78" />
    </svg>
  ) : item.visual === "certif" ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs><linearGradient id="profileGiftCyanStroke" x1="5" y1="3" x2="19" y2="20" gradientUnits="userSpaceOnUse"><stop stopColor="#e8feff" /><stop offset=".4" stopColor="#66edfa" /><stop offset="1" stopColor="#2facf5" /></linearGradient></defs>
      <path d="m12 2.7 2.05 1.45 2.5-.2.85 2.35 2.2 1.2-.65 2.42 1.22 2.18-1.72 1.82-.25 2.5-2.45.5-1.62 1.9L12 17.7l-2.13 1.12-1.62-1.9-2.45-.5-.25-2.5-1.72-1.82 1.22-2.18L4.4 7.5l2.2-1.2.85-2.35 2.5.2L12 2.7Z" stroke="url(#profileGiftCyanStroke)" strokeWidth=".72" />
      <circle cx="12" cy="11.2" r="5.25" strokeWidth=".48" opacity=".58" />
      <path d="m9.2 11.25 1.82 1.82 3.9-3.9" strokeWidth=".9" />
      <path d="m9.75 4.3 2.2-1.05 1.9 1.2M9.5 11.25l1.5 1.5" stroke="#fff" strokeWidth=".32" opacity=".82" />
    </svg>
  ) : null;
  return (
    <span
      className={`profile-gift-object is-${item.visual} ${compact ? "is-compact" : ""}`}
      style={{ "--gift-tone": item.tone } as CSSProperties}
      aria-hidden="true"
    >
      <span className="profile-gift-object__halo" />
      <span className="profile-gift-object__case" />
      <span className="profile-gift-object__token">{customIcon ?? <Icon size={size} strokeWidth={1.8} />}</span>
      <span className="profile-gift-object__ribbon" />
    </span>
  );
}
