import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardSignature,
  Clock3,
  Coins,
  CreditCard,
  Download,
  Eye,
  FileText,
  Fingerprint,
  KeyRound,
  Laptop,
  Mail,
  MonitorSmartphone,
  PackageCheck,
  PencilLine,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  UsersRound,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { spaceModules, type DemoProfile, type SpaceModuleId } from "../profile.data";
import type {
  ProfileContractRecord,
  ProfileHardwareRecord,
  ProfileOrganizationInvitationRecord,
  ProfilePrivateDashboard,
  ProfileTransactionRecord,
} from "../profile.private.service";

export type PrivateQuickAction =
  | { kind: "invite-member" }
  | { kind: "edit-member"; memberName: string }
  | { kind: "payment-method" }
  | { kind: "add-hardware" }
  | { kind: "edit-hardware"; equipmentName: string }
  | { kind: "hardware-unavailability"; equipmentName: string }
  | { kind: "transaction-detail"; readOnly?: boolean; transaction: { title: string; reference: string; category: string; amount: string; status: string; date: string } };

type PrivateModuleViewProps = {
  moduleId: SpaceModuleId;
  profile: DemoProfile;
  dashboard: ProfilePrivateDashboard | null;
  dataStatus: "loading" | "ready" | "demo" | "error";
  dataError: string | null;
  allowDemoActions: boolean;
  onRetry: () => void;
  profileVisibility: ProfileVisibilityState;
  onToggleProfileVisibility: (id: ProfileVisibilityId) => void;
  onEditProfile: () => void;
  onViewerPreview: () => void;
  onBack: () => void;
  onOpenQuickAction: (action: PrivateQuickAction) => void;
  onToast: (message: string) => void;
  presentation?: "standalone" | "embedded";
};

type ProfileVisibilityId = "bio" | "role" | "grade" | "collab" | "viewer";
type ProfileVisibilityState = Record<ProfileVisibilityId, boolean>;

const profileVisibilityRows: Array<{ id: ProfileVisibilityId; label: string; detail: string }> = [
  { id: "bio", label: "Bio publique", detail: "Visible sur ton profil et le Globe" },
  { id: "role", label: "Rôle artistique", detail: "Métier et spécialités publiques" },
  { id: "grade", label: "Grade et niveau", detail: "Badge officiel Meewav" },
  { id: "collab", label: "Bouton Collaborer", detail: "Demandes directes autorisées" },
  { id: "viewer", label: "Menu Viewer", detail: "Navigation publique avancée" },
];

type PrivateRecord = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  value: string;
  status: string;
  icon: LucideIcon;
  description: string;
  facts: Array<[string, string]>;
  timeline: Array<[string, string]>;
  ageDays?: number;
  reference?: string;
  category?: string;
};

type ConfirmationState = {
  kind: "withdraw" | "sign" | "refuse" | "revoke" | "remove";
  eyebrow: string;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "accent";
};

const modulePresentation: Record<SpaceModuleId, {
  icon: LucideIcon;
  eyebrow: string;
  intro: string;
  accent: string;
  metrics: Array<[string, string]>;
  actionLabel: string;
}> = {
  wallet: {
    icon: WalletCards,
    eyebrow: "Finances",
    intro: "Centralise les soldes disponibles, tes comptes de versement et chaque retrait.",
    accent: "#6b7cff",
    metrics: [["Disponible", "3 842 €"], ["En attente", "420 €"], ["Token MW", "2,84 €"]],
    actionLabel: "Ajouter un compte",
  },
  transactions: {
    icon: ReceiptText,
    eyebrow: "Historique financier",
    intro: "Retrouve chaque mouvement, son origine et les justificatifs associés.",
    accent: "#34d399",
    metrics: [["Ce mois", "126"], ["Entrées", "3 360 €"], ["Sorties", "420 €"]],
    actionLabel: "Exporter",
  },
  contracts: {
    icon: ClipboardSignature,
    eyebrow: "Droits & signatures",
    intro: "Pilote les accords actifs, les validations en attente et les échéances sensibles.",
    accent: "#a7afc1",
    metrics: [["Actifs", "8"], ["À signer", "2"], ["Archivés", "14"]],
    actionLabel: "Nouveau modèle",
  },
  hardware: {
    icon: Wrench,
    eyebrow: "Studio",
    intro: "Gère le matériel déclaré, son état et sa disponibilité pour les prochaines sessions.",
    accent: "#ffb86b",
    metrics: [["Éléments", "14"], ["Disponibles", "12"], ["Maintenance", "2"]],
    actionLabel: "Ajouter du matériel",
  },
  security: {
    icon: ShieldCheck,
    eyebrow: "Protection du compte",
    intro: "Contrôle les appareils, les connexions et les méthodes de vérification de ton compte.",
    accent: "#8b5cff",
    metrics: [["Score", "92 / 100"], ["Appareils", "2"], ["Alertes", "0"]],
    actionLabel: "Lancer un audit",
  },
  organization: {
    icon: UsersRound,
    eyebrow: "Équipe & permissions",
    intro: "Attribue précisément les rôles, les périmètres et les accès de ton organisation.",
    accent: "#19b8ff",
    metrics: [["Membres", "6"], ["Administrateurs", "2"], ["Invitation", "1"]],
    actionLabel: "Inviter un membre",
  },
};

const moduleRecords: Record<SpaceModuleId, PrivateRecord[]> = {
  wallet: [
    {
      id: "wallet-main",
      title: "Solde principal",
      subtitle: "Revenus vérifiés",
      meta: "Mis à jour à 12:42",
      value: "3 842 €",
      status: "Disponible",
      icon: WalletCards,
      description: "Ce solde regroupe les revenus libérés et immédiatement disponibles pour un retrait.",
      facts: [["Compte de versement", "FR76 •••• 4821"], ["Délai estimé", "1 à 2 jours ouvrés"], ["Seuil minimum", "50 €"], ["Vérification", "Identité validée"]],
      timeline: [["Aujourd’hui · 10:18", "+320 € · Pack Ambient Keys"], ["14 juillet", "+84 € · Golden Drop"], ["12 juillet", "+49 € · Licence audio"]],
    },
    {
      id: "wallet-pending",
      title: "Solde en attente",
      subtitle: "Paiements en vérification",
      meta: "Libération prévue le 18 juillet",
      value: "420 €",
      status: "En traitement",
      icon: Clock3,
      description: "Les revenus de cette enveloppe sont sécurisés pendant la période de validation des transactions.",
      facts: [["Transactions", "7"], ["Prochaine libération", "320 €"], ["Date estimée", "18 juillet 2026"], ["Litige", "Aucun"]],
      timeline: [["Aujourd’hui", "Contrôle automatique terminé"], ["Hier", "Versement Room Paris 11 reçu"], ["12 juillet", "Période de sécurité ouverte"]],
    },
    {
      id: "wallet-token",
      title: "Token MW",
      subtitle: "Valeur de référence",
      meta: "+4,8 % sur 30 jours",
      value: "2,84 €",
      status: "En hausse",
      icon: Coins,
      description: "Vue synthétique de la valeur de ton portefeuille de tokens et de sa progression récente.",
      facts: [["Quantité", "1 248 MW"], ["Valeur estimée", "3 544 €"], ["Variation 30 j", "+4,8 %"], ["Dernière opération", "+24 MW"]],
      timeline: [["Aujourd’hui", "+8 MW · activité créative"], ["13 juillet", "+12 MW · progression de grade"], ["8 juillet", "+4 MW · participation Room"]],
    },
  ],
  transactions: [
    {
      id: "transaction-ambient",
      title: "Pack Ambient Keys",
      subtitle: "Vente Marketplace",
      meta: "Aujourd’hui · 10:18",
      value: "+320 €",
      status: "Crédité",
      ageDays: 0,
      reference: "MW-260715-0182",
      category: "Revenu",
      icon: Coins,
      description: "Paiement finalisé pour la licence commerciale du pack Ambient Keys.",
      facts: [["Référence", "MW-260715-0182"], ["Canal", "Marketplace"], ["Frais Meewav", "16 €"], ["Net versé", "320 €"]],
      timeline: [["10:18", "Solde principal crédité"], ["10:16", "Paiement confirmé"], ["10:12", "Commande créée"]],
    },
    {
      id: "transaction-withdrawal",
      title: "Retrait bancaire",
      subtitle: "Compte principal",
      meta: "Hier · 16:40",
      value: "−320 €",
      status: "Effectué",
      ageDays: 1,
      reference: "PAY-88421",
      category: "Dépense",
      icon: CreditCard,
      description: "Virement envoyé vers le compte bancaire principal vérifié.",
      facts: [["Référence", "PAY-88421"], ["Destination", "FR76 •••• 4821"], ["Frais", "0 €"], ["Date de valeur", "14 juillet"]],
      timeline: [["Hier · 16:40", "Virement exécuté"], ["Hier · 11:02", "Retrait validé"], ["13 juillet", "Demande créée"]],
    },
    {
      id: "transaction-drop",
      title: "Golden Drop",
      subtitle: "Soutien communauté",
      meta: "12 juillet · 21:08",
      value: "+84 €",
      status: "Crédité",
      ageDays: 3,
      reference: "GD-88410",
      category: "Revenu",
      icon: PackageCheck,
      description: "Revenu issu d’un Golden Drop reçu pendant une session publique.",
      facts: [["Référence", "GD-88410"], ["Session", "Minuit Bleu Live"], ["Contributeurs", "18"], ["Net versé", "84 €"]],
      timeline: [["21:08", "Solde crédité"], ["21:07", "Session clôturée"], ["20:32", "Premier soutien reçu"]],
    },
    {
      id: "transaction-license",
      title: "Licence Nocturne 01",
      subtitle: "Licence audio",
      meta: "10 juillet · 09:14",
      value: "+49 €",
      status: "Crédité",
      ageDays: 5,
      reference: "LIC-11890",
      category: "Revenu",
      icon: FileText,
      description: "Licence personnelle vendue depuis la médiathèque publique.",
      facts: [["Référence", "LIC-11890"], ["Territoire", "Europe"], ["Durée", "12 mois"], ["Net versé", "49 €"]],
      timeline: [["09:14", "Licence activée"], ["09:12", "Paiement confirmé"], ["09:10", "Commande créée"]],
    },
    {
      id: "transaction-room",
      title: "Room Paris 11",
      subtitle: "Performance live",
      meta: "3 juillet · 23:42",
      value: "+680 €",
      status: "Crédité",
      ageDays: 12,
      reference: "ROOM-77304",
      category: "Revenu",
      icon: UsersRound,
      description: "Répartition finale des revenus générés pendant la Room Paris 11.",
      facts: [["Référence", "ROOM-77304"], ["Participants", "8 artistes"], ["Part Nox", "34 %"], ["Net versé", "680 €"]],
      timeline: [["3 juillet", "Solde crédité"], ["2 juillet", "Répartition validée"], ["28 juin", "Room clôturée"]],
    },
    {
      id: "transaction-tools",
      title: "Abonnement Studio Tools",
      subtitle: "Service professionnel",
      meta: "21 juin · 08:00",
      value: "−29 €",
      status: "Effectué",
      ageDays: 24,
      reference: "SUB-62018",
      category: "Dépense",
      icon: Wrench,
      description: "Renouvellement mensuel des outils professionnels du studio.",
      facts: [["Référence", "SUB-62018"], ["Période", "Juillet 2026"], ["TVA", "4,83 €"], ["Total", "29 €"]],
      timeline: [["21 juin", "Paiement effectué"], ["20 juin", "Facture créée"], ["21 mai", "Précédent renouvellement"]],
    },
    {
      id: "transaction-pending",
      title: "Licence Neon City",
      subtitle: "Synchronisation",
      meta: "18 mai · 14:36",
      value: "+1 240 €",
      status: "En attente",
      ageDays: 58,
      reference: "SYNC-51772",
      category: "Revenu",
      icon: FileText,
      description: "Licence de synchronisation en attente de validation finale par l’acheteur.",
      facts: [["Référence", "SYNC-51772"], ["Projet", "Neon City"], ["Échéance", "18 juillet"], ["Net prévu", "1 240 €"]],
      timeline: [["Aujourd’hui", "Rappel envoyé"], ["18 mai", "Facture transmise"], ["16 mai", "Accord commercial validé"]],
    },
  ],
  contracts: [
    {
      id: "contract-aurora",
      title: "Aurora Tapes",
      subtitle: "Partage de droits",
      meta: "Échéance vendredi",
      value: "2 signatures",
      status: "À signer",
      icon: ClipboardSignature,
      description: "Accord de répartition des droits pour l’album Aurora Tapes et ses déclinaisons.",
      facts: [["Ton rôle", "Producteur principal"], ["Ta part", "35 %"], ["Participants", "4 artistes"], ["Échéance", "17 juillet 2026"]],
      timeline: [["Hier", "Maya Sol a signé"], ["13 juillet", "Version finale publiée"], ["9 juillet", "Répartition mise à jour"]],
    },
    {
      id: "contract-room",
      title: "Room Paris 11",
      subtitle: "Accord de participation",
      meta: "Validé le 8 juillet",
      value: "8 artistes",
      status: "Actif",
      icon: UsersRound,
      description: "Accord collectif encadrant la captation et la diffusion de la performance live.",
      facts: [["Statut", "Tous ont signé"], ["Diffusion", "Monde"], ["Durée", "24 mois"], ["Renouvellement", "Manuel"]],
      timeline: [["8 juillet", "Contrat activé"], ["7 juillet", "Dernière signature reçue"], ["4 juillet", "Invitation envoyée"]],
    },
    {
      id: "contract-license",
      title: "Licence Minuit Bleu",
      subtitle: "Synchronisation audiovisuelle",
      meta: "Expire dans 42 jours",
      value: "12 mois",
      status: "À renouveler",
      icon: FileText,
      description: "Licence de synchronisation limitée pour le titre Minuit Bleu.",
      facts: [["Territoire", "France"], ["Support", "Web & social"], ["Exclusivité", "Non"], ["Expiration", "26 août 2026"]],
      timeline: [["Aujourd’hui", "Rappel d’échéance créé"], ["26 août 2025", "Contrat activé"], ["20 août 2025", "Accord signé"]],
    },
  ],
  hardware: [
    {
      id: "hardware-nord",
      title: "Nord Stage 4",
      subtitle: "Clavier de scène",
      meta: "Studio A · emplacement 02",
      value: "Disponible",
      status: "Prêt",
      icon: Wrench,
      description: "Clavier principal du studio, déclaré disponible pour les sessions collaboratives.",
      facts: [["État", "Excellent"], ["Disponibilité", "Lun–Ven · 18–23 h"], ["Dernier contrôle", "2 juillet"], ["Numéro interne", "HW-NS4-002"]],
      timeline: [["Aujourd’hui", "Disponibilité synchronisée"], ["2 juillet", "Contrôle terminé"], ["18 juin", "Ajouté au studio"]],
    },
    {
      id: "hardware-apollo",
      title: "Apollo Twin X",
      subtitle: "Interface audio",
      meta: "Studio A · régie",
      value: "Disponible",
      status: "Prêt",
      icon: PackageCheck,
      description: "Interface audio principale de la régie, prête pour l’enregistrement et le live.",
      facts: [["État", "Très bon"], ["Firmware", "11.5.2"], ["Dernier contrôle", "10 juillet"], ["Numéro interne", "HW-ATX-008"]],
      timeline: [["10 juillet", "Firmware mis à jour"], ["9 juillet", "Diagnostic effectué"], ["4 mai", "Ajouté au studio"]],
    },
    {
      id: "hardware-neumann",
      title: "Neumann U87",
      subtitle: "Microphone studio",
      meta: "Contrôle vendredi",
      value: "Maintenance",
      status: "À vérifier",
      icon: Wrench,
      description: "Microphone réservé aux prises studio. Un contrôle préventif est planifié.",
      facts: [["État", "À contrôler"], ["Disponibilité", "Suspendue"], ["Prochain contrôle", "17 juillet"], ["Numéro interne", "HW-U87-004"]],
      timeline: [["Hier", "Contrôle planifié"], ["12 juillet", "Disponibilité suspendue"], ["22 juin", "Dernière utilisation"]],
    },
  ],
  security: [
    {
      id: "security-current",
      title: "MacBook Pro",
      subtitle: "Chrome · session actuelle",
      meta: "Paris · maintenant",
      value: "Actuel",
      status: "Fiable",
      icon: Laptop,
      description: "Appareil actuellement utilisé. La connexion est protégée par la double authentification.",
      facts: [["Navigateur", "Chrome 143"], ["Adresse", "Paris, France"], ["Dernière activité", "Maintenant"], ["Vérification", "2FA validée"]],
      timeline: [["14:32", "Connexion réussie"], ["14:31", "Code 2FA validé"], ["12 juillet", "Appareil reconnu"]],
    },
    {
      id: "security-iphone",
      title: "iPhone 17 Pro",
      subtitle: "Application Meewav",
      meta: "Paris · hier à 22:18",
      value: "Autorisé",
      status: "Fiable",
      icon: Smartphone,
      description: "Appareil mobile autorisé à consulter le profil et à gérer les notifications.",
      facts: [["Application", "Meewav 6.2"], ["Adresse", "Paris, France"], ["Dernière activité", "Hier · 22:18"], ["Accès sensible", "Limité"]],
      timeline: [["Hier · 22:18", "Consultation du profil"], ["14 juillet", "Autorisation renouvelée"], ["8 juillet", "Appareil ajouté"]],
    },
    {
      id: "security-2fa",
      title: "Double authentification",
      subtitle: "Application d’authentification",
      meta: "Activée depuis 94 jours",
      value: "Active",
      status: "Renforcée",
      icon: KeyRound,
      description: "Une vérification supplémentaire protège les connexions et les opérations sensibles.",
      facts: [["Méthode principale", "Application"], ["Méthode de secours", "Codes uniques"], ["Codes restants", "7"], ["Dernier contrôle", "Aujourd’hui"]],
      timeline: [["Aujourd’hui", "Méthode vérifiée"], ["8 juillet", "Code de secours utilisé"], ["12 avril", "2FA activée"]],
    },
  ],
  organization: [
    {
      id: "member-maya",
      title: "Maya Sol",
      subtitle: "Direction artistique",
      meta: "Membre depuis mars 2025",
      value: "Admin",
      status: "Actif",
      icon: Fingerprint,
      description: "Supervise l’identité artistique, les publications et la cohérence des projets.",
      facts: [["Rôle", "Administratrice"], ["Périmètre", "Profil, médias, projets"], ["Dernière activité", "Aujourd’hui · 11:24"], ["2FA", "Active"]],
      timeline: [["Aujourd’hui", "Média publié"], ["Hier", "Contrat Aurora consulté"], ["10 juillet", "Profil public modifié"]],
    },
    {
      id: "member-nadir",
      title: "Nadir K.",
      subtitle: "Régie live",
      meta: "Membre depuis octobre 2025",
      value: "Contributeur",
      status: "Actif",
      icon: MonitorSmartphone,
      description: "Prépare les Rooms, le matériel et les paramètres techniques des performances.",
      facts: [["Rôle", "Contributeur"], ["Périmètre", "Rooms, studio, matériel"], ["Dernière activité", "Hier · 23:08"], ["2FA", "Active"]],
      timeline: [["Hier", "Matériel mis à jour"], ["13 juillet", "Room programmée"], ["8 juillet", "Session clôturée"]],
    },
    {
      id: "member-lila",
      title: "Lila North",
      subtitle: "Gestion comptable",
      meta: "Invitation envoyée hier",
      value: "Lecture seule",
      status: "En attente",
      icon: Mail,
      description: "Invitation limitée aux documents financiers et aux justificatifs de paiement.",
      facts: [["Rôle prévu", "Comptabilité"], ["Périmètre", "Finances en lecture"], ["Expiration", "Dans 6 jours"], ["2FA", "Obligatoire"]],
      timeline: [["Hier · 14:02", "Invitation envoyée"], ["Hier · 13:58", "Permissions définies"], ["Hier · 13:55", "Membre préparé"]],
    },
  ],
};

const emptyModuleRecords: Record<SpaceModuleId, PrivateRecord[]> = {
  wallet: [],
  transactions: [],
  contracts: [],
  hardware: [],
  security: [],
  organization: [],
};

function privateMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataText(metadata: Record<string, unknown>, key: string, fallback = "") {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatPrivateDate(value: string | null | undefined) {
  if (!value) return "Date indisponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatPrivateCurrency(value: number, currency = "EUR", forceSign = false) {
  const formatted = new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(value));
  if (!forceSign) return formatted;
  return `${value >= 0 ? "+" : "−"}${formatted}`;
}

function transactionAmount(record: ProfileTransactionRecord) {
  const parsed = typeof record.amount === "number" ? record.amount : Number(record.amount);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  const metadata = privateMetadata(record.metadata);
  const direction = metadataText(metadata, "direction").toLowerCase();
  const isExpense = amount < 0 || /debit|expense/.test(direction) || /dépense|debit|débit|retrait/.test(record.category.toLowerCase());
  return isExpense ? -Math.abs(amount) : Math.abs(amount);
}

function mapTransactionRecord(record: ProfileTransactionRecord): PrivateRecord {
  const metadata = privateMetadata(record.metadata);
  const signedAmount = transactionAmount(record);
  const isIncome = signedAmount >= 0;
  const rawStatus = metadataText(metadata, "status", isIncome ? "credited" : "completed").toLowerCase();
  const isPending = /pending|processing|review|attente/.test(rawStatus);
  const occurredAt = new Date(record.occurred_at);
  const ageDays = Number.isNaN(occurredAt.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - occurredAt.getTime()) / 86_400_000));
  const reference = metadataText(metadata, "reference", `MW-${record.id.slice(0, 8).toUpperCase()}`);
  const channel = metadataText(metadata, "source", metadataText(metadata, "channel", record.category));

  return {
    id: record.id,
    title: record.title,
    subtitle: channel,
    meta: formatPrivateDate(record.occurred_at),
    value: formatPrivateCurrency(signedAmount, record.currency || "EUR", true),
    status: isPending ? "En attente" : isIncome ? "Crédité" : "Effectué",
    icon: record.is_token_trade ? Coins : isIncome ? PackageCheck : CreditCard,
    description: metadataText(metadata, "description", "Mouvement enregistré dans l’activité privée du profil."),
    facts: [["Référence", reference], ["Catégorie", record.category], ["Canal", channel], ["Devise", record.currency || "EUR"]],
    timeline: [[formatPrivateDate(record.occurred_at), "Mouvement enregistré"]],
    ageDays,
    reference,
    category: isIncome ? "Revenu" : "Dépense",
  };
}

function mapContractRecord(record: ProfileContractRecord): PrivateRecord {
  const metadata = privateMetadata(record.metadata);
  const parties = record.parties || metadataText(metadata, "parties", "Non renseignées");
  return {
    id: record.id,
    title: record.title,
    subtitle: record.contract_type,
    meta: formatPrivateDate(record.updated_at),
    value: record.amount_label || parties,
    status: metadataText(metadata, "status_label", record.status),
    icon: ClipboardSignature,
    description: record.details || "Les détails contractuels n’ont pas encore été renseignés.",
    facts: [["Type", record.contract_type], ["Parties", parties], ["Source", record.source || "Profil"], ["Montant", record.amount_label || "Non renseigné"]],
    timeline: [[formatPrivateDate(record.updated_at), "Dernière mise à jour"], [formatPrivateDate(record.created_at), "Document créé"]],
  };
}

function mapHardwareRecord(record: ProfileHardwareRecord): PrivateRecord {
  const metadata = privateMetadata(record.metadata);
  const status = metadataText(metadata, "status_label", record.status);
  return {
    id: record.id,
    title: record.name,
    subtitle: record.device_type,
    meta: metadataText(metadata, "location", "Emplacement non renseigné"),
    value: status,
    status,
    icon: /interface|console|audio/i.test(record.device_type) ? PackageCheck : Wrench,
    description: metadataText(metadata, "description", "Équipement déclaré dans l’inventaire privé du profil."),
    facts: [["État", status], ["Latence", record.latency_label || "Non renseignée"], ["Emplacement", metadataText(metadata, "location", "Non renseigné")], ["Dernier contrôle", metadataText(metadata, "last_check", formatPrivateDate(record.updated_at))]],
    timeline: [[formatPrivateDate(record.updated_at), "Fiche mise à jour"], [formatPrivateDate(record.created_at), "Équipement ajouté"]],
  };
}

function mapInvitationRecord(record: ProfileOrganizationInvitationRecord): PrivateRecord {
  const metadata = privateMetadata(record.metadata);
  const permissions = Array.isArray(record.permissions) ? record.permissions.filter((permission): permission is string => typeof permission === "string") : [];
  return {
    id: record.id,
    title: record.recipient_name,
    subtitle: record.space_name,
    meta: formatPrivateDate(record.updated_at),
    value: record.role,
    status: metadataText(metadata, "status_label", record.status),
    icon: Mail,
    description: `Invitation ${record.handle ? `destinée à ${record.handle}` : "d’organisation"}.`,
    facts: [["Rôle prévu", record.role], ["Périmètre", permissions.join(", ") || "Non renseigné"], ["Dernière activité", formatPrivateDate(record.updated_at)], ["Double authentification", "À confirmer à l’acceptation"]],
    timeline: [[formatPrivateDate(record.updated_at), "Invitation mise à jour"], [formatPrivateDate(record.created_at), "Invitation créée"]],
  };
}

function mapDashboardRecords(dashboard: ProfilePrivateDashboard): Record<SpaceModuleId, PrivateRecord[]> {
  const transactions = dashboard.transactions.map(mapTransactionRecord);
  const securityStatus = dashboard.security.mfaVerifiedFactors > 0 ? "Renforcée" : "À renforcer";
  const securityRecords: PrivateRecord[] = [
    {
      id: "security-current",
      title: "Session actuelle",
      subtitle: dashboard.security.email || "Compte authentifié",
      meta: formatPrivateDate(dashboard.security.lastSignInAt),
      value: "Actuel",
      status: dashboard.security.emailConfirmed ? "Fiable" : "À vérifier",
      icon: Laptop,
      description: "Session Supabase actuellement utilisée par ce navigateur.",
      facts: [["E-mail", dashboard.security.email || "Non renseigné"], ["E-mail confirmé", dashboard.security.emailConfirmed ? "Oui" : "Non"], ["Dernière connexion", formatPrivateDate(dashboard.security.lastSignInAt)], ["Compte créé", formatPrivateDate(dashboard.security.accountCreatedAt)]],
      timeline: [[formatPrivateDate(dashboard.security.lastSignInAt), "Dernière connexion connue"]],
    },
    {
      id: "security-2fa",
      title: "Double authentification",
      subtitle: dashboard.security.mfaAvailable ? `${dashboard.security.mfaVerifiedFactors} facteur vérifié` : "État temporairement indisponible",
      meta: "Supabase Auth",
      value: dashboard.security.mfaVerifiedFactors > 0 ? "Active" : "Inactive",
      status: securityStatus,
      icon: KeyRound,
      description: "État réel des facteurs MFA enregistrés pour le compte.",
      facts: [["Facteurs vérifiés", String(dashboard.security.mfaVerifiedFactors)], ["Service", "Supabase Auth"], ["Disponibilité", dashboard.security.mfaAvailable ? "Vérifiée" : "Indisponible"], ["Recommandation", dashboard.security.mfaVerifiedFactors > 0 ? "Aucune" : "Activer un facteur MFA"]],
      timeline: [],
    },
  ];
  const walletRecords: PrivateRecord[] = dashboard.transactions.length ? [{
    id: "wallet-activity",
    title: "Activité financière enregistrée",
    subtitle: `${dashboard.transactions.length} mouvement${dashboard.transactions.length > 1 ? "s" : ""}`,
    meta: formatPrivateDate(dashboard.wallet.latestActivityAt),
    value: formatPrivateCurrency(dashboard.wallet.activityNet, dashboard.wallet.currency),
    status: "Lecture seule",
    icon: WalletCards,
    description: "Synthèse des mouvements du profil. Ce montant n’est pas un solde bancaire retirable.",
    facts: [["Revenus enregistrés", formatPrivateCurrency(dashboard.wallet.incomeTotal, dashboard.wallet.currency)], ["Dépenses enregistrées", formatPrivateCurrency(dashboard.wallet.expenseTotal, dashboard.wallet.currency)], ["Mouvements", String(dashboard.transactions.length)], ["Source", "Activité du profil"]],
    timeline: transactions.slice(0, 3).map((record) => [record.meta, `${record.title} · ${record.value}`]),
  }] : [];

  return {
    wallet: walletRecords,
    transactions,
    contracts: dashboard.contracts.map(mapContractRecord),
    hardware: dashboard.hardware.map(mapHardwareRecord),
    security: securityRecords,
    organization: dashboard.organizationInvitations.map(mapInvitationRecord),
  };
}

function ConfirmationModal({ state, onCancel, onConfirm }: { state: ConfirmationState; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="profile-private-confirm-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className={`profile-private-confirm-modal is-${state.tone ?? "accent"}`} role="alertdialog" aria-modal="true" aria-labelledby="private-confirm-title">
        <div className="profile-private-confirm-modal__icon">{state.tone === "danger" ? <Trash2 size={23} /> : <ShieldCheck size={23} />}</div>
        <span className="profile-kicker">{state.eyebrow}</span>
        <h3 id="private-confirm-title">{state.title}</h3>
        <p>{state.message}</p>
        <div className="profile-private-confirm-modal__actions">
          <button type="button" className="profile-soft-button" onClick={onCancel}>Annuler</button>
          <button type="button" className={`profile-primary-button ${state.tone === "danger" ? "is-danger" : ""}`} onClick={onConfirm}>
            <Check size={16} /> {state.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function ProfilePrivateModuleView({
  moduleId,
  profile,
  dashboard,
  dataStatus,
  dataError,
  allowDemoActions,
  onRetry,
  profileVisibility,
  onToggleProfileVisibility,
  onEditProfile,
  onViewerPreview,
  onBack,
  onOpenQuickAction,
  onToast,
  presentation = "standalone",
}: PrivateModuleViewProps) {
  const config = modulePresentation[moduleId];
  const moduleData = spaceModules.find((item) => item.id === moduleId);
  const ModuleIcon = config.icon;
  const recordsByModule = useMemo(() => dashboard
    ? mapDashboardRecords(dashboard)
    : allowDemoActions ? moduleRecords : emptyModuleRecords, [allowDemoActions, dashboard]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [transactionPeriod, setTransactionPeriod] = useState<7 | 30 | 365>(30);
  const [transactionType, setTransactionType] = useState<"all" | "income" | "expense">("all");
  const [transactionStatus, setTransactionStatus] = useState<"all" | "completed" | "pending">("all");
  const [securitySettings, setSecuritySettings] = useState({ twoFactor: true, loginAlerts: true, payoutLock: true });

  useEffect(() => {
    setQuery("");
    setSelectedId(recordsByModule[moduleId][0]?.id ?? "");
    setResolvedIds([]);
    setRemovedIds([]);
    setConfirmation(null);
    setTransactionPeriod(30);
    setTransactionType("all");
    setTransactionStatus("all");
  }, [moduleId, recordsByModule]);

  const visibleRecords = useMemo(() => recordsByModule[moduleId].filter((record) => (
    !removedIds.includes(record.id)
    && `${record.title} ${record.subtitle} ${record.status}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"))
  )), [moduleId, query, recordsByModule, removedIds]);

  useEffect(() => {
    if (!visibleRecords.some((record) => record.id === selectedId)) setSelectedId(visibleRecords[0]?.id ?? "");
  }, [selectedId, visibleRecords]);

  const selected = visibleRecords.find((record) => record.id === selectedId) ?? visibleRecords[0];
  const SelectedIcon = selected?.icon ?? FileText;

  const transactionRows = useMemo(() => recordsByModule.transactions.filter((record) => {
    const matchesQuery = `${record.title} ${record.reference} ${record.subtitle} ${record.status}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"));
    const matchesPeriod = (record.ageDays ?? 0) <= transactionPeriod;
    const matchesType = transactionType === "all" || (transactionType === "income" ? record.category === "Revenu" : record.category === "Dépense");
    const matchesStatus = transactionStatus === "all" || (transactionStatus === "pending" ? record.status === "En attente" : record.status !== "En attente");
    return matchesQuery && matchesPeriod && matchesType && matchesStatus;
  }), [query, recordsByModule, transactionPeriod, transactionStatus, transactionType]);

  const exportTransactions = () => {
    if (!transactionRows.length) return;
    const csv = [
      ["Date", "Référence", "Type", "Libellé", "Montant", "Statut"],
      ...transactionRows.map((record) => [record.meta, record.reference ?? "", record.category ?? "", record.title, record.value, record.status]),
    ].map((row) => row.map((cell) => `"${String(cell).split('"').join('""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meewav-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleHeaderAction = () => {
    if (moduleId === "transactions") {
      exportTransactions();
      return;
    }
    if (!allowDemoActions) return;
    if (moduleId === "wallet") onOpenQuickAction({ kind: "payment-method" });
    else if (moduleId === "organization") onOpenQuickAction({ kind: "invite-member" });
    else if (moduleId === "hardware") onOpenQuickAction({ kind: "add-hardware" });
    else if (moduleId === "contracts") onToast("Nouveau modèle de contrat préparé");
    else onToast("Audit terminé : aucun risque critique détecté");
  };

  const confirmAction = () => {
    if (!confirmation || !selected) return;
    if (confirmation.kind === "sign") {
      setResolvedIds((current) => [...current, selected.id]);
      onToast(`« ${selected.title} » signé et horodaté`);
    } else if (confirmation.kind === "refuse") {
      setResolvedIds((current) => [...current, selected.id]);
      onToast(`« ${selected.title} » refusé et archivé`);
    } else if (confirmation.kind === "withdraw") {
      setResolvedIds((current) => [...current, selected.id]);
      onToast("Retrait de 3 842 € programmé");
    } else {
      setRemovedIds((current) => [...current, selected.id]);
      onToast(confirmation.kind === "revoke" ? `${selected.title} révoqué` : `${selected.title} retiré de l’organisation`);
    }
    setConfirmation(null);
  };

  const openTransactionDetail = (record: PrivateRecord) => onOpenQuickAction({
    kind: "transaction-detail",
    readOnly: !allowDemoActions,
    transaction: {
      title: record.title,
      reference: record.reference ?? record.facts[0][1],
      category: record.category ?? record.subtitle,
      amount: record.value,
      status: record.status,
      date: record.meta,
    },
  });

  const requestWithdrawal = () => {
    if (!allowDemoActions) return;
    setSelectedId("wallet-main");
    setConfirmation({ kind: "withdraw", eyebrow: "Confirmation financière", title: "Demander le retrait du solde disponible ?", message: "3 842 € seront envoyés vers le compte principal se terminant par 4821. Le délai estimé est de 1 à 2 jours ouvrés.", confirmLabel: "Confirmer le retrait" });
  };

  const requestContractDecision = (kind: "sign" | "refuse") => {
    if (!selected || !allowDemoActions) return;
    setConfirmation(kind === "sign"
      ? { kind, eyebrow: "Signature électronique", title: `Signer « ${selected.title} » ?`, message: "Ta signature engage les droits et la répartition indiqués dans le document. Une copie horodatée sera conservée.", confirmLabel: "Signer le contrat" }
      : { kind, eyebrow: "Décision contractuelle", title: `Refuser « ${selected.title} » ?`, message: "Le document sera archivé comme refusé et les autres signataires seront informés.", confirmLabel: "Refuser le contrat", tone: "danger" });
  };

  const requestMemberRemoval = () => {
    if (!selected || !allowDemoActions) return;
    setConfirmation({ kind: "remove", eyebrow: "Permissions de l’équipe", title: `Retirer l’accès de ${selected.title} ?`, message: "Le membre perdra immédiatement l’accès à l’organisation. Son historique d’activité restera disponible.", confirmLabel: "Retirer l’accès", tone: "danger" });
  };

  const renderWalletWorkspace = () => (
    <section className="profile-private-wallet-workspace" aria-label="Gestion du portefeuille">
      <article className="profile-private-wallet-balance">
        <div className="profile-private-wallet-balance__heading"><span><WalletCards size={23} /></span><div><small>{dashboard ? "Net des mouvements enregistrés" : "Solde immédiatement disponible"}</small><strong>{dashboard ? formatPrivateCurrency(dashboard.wallet.activityNet, dashboard.wallet.currency) : "3 842,00 €"}</strong><p>{dashboard ? `Dernière activité · ${formatPrivateDate(dashboard.wallet.latestActivityAt)}` : "Mis à jour aujourd’hui à 12:42"}</p></div><em>{dashboard ? "Lecture seule" : "+12,2 % ce mois"}</em></div>
        <div className="profile-private-wallet-balance__flow"><div><span>Revenus enregistrés</span><strong>{dashboard ? formatPrivateCurrency(dashboard.wallet.incomeTotal, dashboard.wallet.currency) : "2 940 €"}</strong></div><div><span>Dépenses enregistrées</span><strong>{dashboard ? formatPrivateCurrency(dashboard.wallet.expenseTotal, dashboard.wallet.currency) : "420 €"}</strong></div><div><span>Mouvements</span><strong>{dashboard ? dashboard.transactions.length : "18 juillet"}</strong></div></div>
        <div className="profile-private-wallet-balance__actions"><button type="button" className="profile-primary-button" onClick={requestWithdrawal} disabled={!allowDemoActions} title={!allowDemoActions ? "Le retrait nécessite un ledger et un prestataire de paiement côté serveur." : undefined}><CreditCard size={16} /> Demander un retrait</button><button type="button" className="profile-soft-button" onClick={() => allowDemoActions && onOpenQuickAction({ kind: "payment-method" })} disabled={!allowDemoActions}><Plus size={15} /> Ajouter un compte</button></div>
      </article>
      <aside className="profile-private-wallet-account">
        <div className="profile-private-wallet-account__top"><span className="profile-kicker"><Building2 size={13} /> Compte de versement</span><span>{allowDemoActions ? "Vérifié" : "Non câblé"}</span></div>
        <strong>{allowDemoActions ? "Compte principal" : "Coordonnées de versement indisponibles"}</strong><p>{allowDemoActions ? "Nox Amani · FR76 •••• 4821" : "Aucune table de moyen de paiement n’existe encore."}</p>
        <div><span>Retrait minimum <strong>{allowDemoActions ? "50 €" : "—"}</strong></span><span>Délai moyen <strong>{allowDemoActions ? "1–2 jours" : "—"}</strong></span></div>
        <button type="button" className="profile-inline-action" onClick={() => allowDemoActions && onOpenQuickAction({ kind: "payment-method" })} disabled={!allowDemoActions}>Gérer les coordonnées <ArrowRight size={14} /></button>
      </aside>
      <article className="profile-private-wallet-activity">
        <div className="profile-private-module-section-title"><div><span className="profile-kicker"><Clock3 size={13} /> Derniers mouvements</span><h3>Paiements et retraits</h3></div><button type="button" onClick={exportTransactions} disabled={!recordsByModule.transactions.length}><Download size={14} /> Exporter</button></div>
        <div className="profile-private-wallet-activity__table">
          <div className="profile-private-wallet-activity__head"><span>Paiements et retraits</span><span>Type</span><span>Statut</span><span>Date</span><span>Montant</span><span /></div>
          {recordsByModule.transactions.slice(0, 4).map((record) => (
            <button key={record.id} type="button" onClick={() => openTransactionDetail(record)}>
              <span className="profile-private-wallet-activity__identity"><i><record.icon size={15} /></i><span><strong>{record.title}</strong><small>{record.subtitle}</small></span></span>
              <span><em className={record.category === "Revenu" ? "is-income" : "is-expense"}>{record.status}</em></span>
              <span className={record.status === "En attente" ? "is-pending" : "is-complete"}><i />{record.status === "En attente" ? "En attente" : "Effectué"}</span>
              <span>{record.meta}</span>
              <strong className={record.category === "Revenu" ? "is-positive" : "is-negative"}>{record.value}</strong>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      </article>
    </section>
  );

  const renderTransactionsWorkspace = () => (
    <section className="profile-private-transactions-workspace" aria-label="Tableau des transactions">
      <div className="profile-private-transactions-metrics">
        <button type="button" className={transactionType === "income" ? "is-active" : ""} onClick={() => setTransactionType((current) => current === "income" ? "all" : "income")}><span>Revenus</span><strong>{dashboard ? formatPrivateCurrency(dashboard.wallet.incomeTotal, dashboard.wallet.currency) : "3 360 €"}</strong><small>{recordsByModule.transactions.filter((record) => record.category === "Revenu").length} opérations</small></button>
        <button type="button" className={transactionType === "expense" ? "is-active" : ""} onClick={() => setTransactionType((current) => current === "expense" ? "all" : "expense")}><span>Dépenses</span><strong>{dashboard ? formatPrivateCurrency(dashboard.wallet.expenseTotal, dashboard.wallet.currency) : "420 €"}</strong><small>{recordsByModule.transactions.filter((record) => record.category === "Dépense").length} opérations</small></button>
        <button type="button" className={transactionStatus === "pending" ? "is-active" : ""} onClick={() => setTransactionStatus((current) => current === "pending" ? "all" : "pending")}><span>En attente</span><strong>{recordsByModule.transactions.filter((record) => record.status === "En attente").length}</strong><small>validation(s) requise(s)</small></button>
        <button type="button" onClick={exportTransactions} disabled={!transactionRows.length}><span>Export</span><strong><Download size={18} /> CSV</strong><small>{transactionRows.length} lignes sélectionnées</small></button>
      </div>
      <div className="profile-private-transactions-toolbar">
        <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une référence, un paiement…" /></label>
        <div className="profile-private-filter-group" aria-label="Période">{([7, 30, 365] as const).map((period) => <button key={period} type="button" className={transactionPeriod === period ? "is-active" : ""} onClick={() => setTransactionPeriod(period)}>{period === 365 ? "12 mois" : `${period} jours`}</button>)}</div>
        <select value={transactionType} onChange={(event) => setTransactionType(event.target.value as typeof transactionType)} aria-label="Type de transaction"><option value="all">Tous les types</option><option value="income">Revenus</option><option value="expense">Dépenses</option></select>
        <select value={transactionStatus} onChange={(event) => setTransactionStatus(event.target.value as typeof transactionStatus)} aria-label="Statut"><option value="all">Tous les statuts</option><option value="completed">Terminées</option><option value="pending">En attente</option></select>
      </div>
      <div className="profile-private-transactions-table" role="table" aria-label="Transactions filtrées">
        <div className="profile-private-transactions-table__header" role="row"><span>Date</span><span>Référence</span><span>Type</span><span>Libellé</span><span>Montant</span><span>Statut</span><span /></div>
        {transactionRows.map((record) => <button key={record.id} type="button" role="row" onClick={() => openTransactionDetail(record)}><span>{record.meta.split(" · ")[0]}</span><span>{record.reference}</span><span><i className={record.category === "Revenu" ? "is-income" : "is-expense"}>{record.category}</i></span><span><strong>{record.title}</strong><small>{record.subtitle}</small></span><span className={record.category === "Revenu" ? "is-positive" : "is-negative"}>{record.value}</span><span><em className={record.status === "En attente" ? "is-pending" : ""}>{record.status}</em></span><ChevronRight size={14} /></button>)}
        {transactionRows.length === 0 && <div className="profile-private-table-empty"><Search size={22} /><strong>Aucune transaction</strong><span>Modifie les filtres pour élargir les résultats.</span></div>}
      </div>
    </section>
  );

  const renderContractsWorkspace = () => (
    <section className="profile-private-contracts-workspace" aria-label="Contrats et aperçu documentaire">
      <aside className="profile-private-contract-list">
        <div className="profile-private-module-section-title"><div><span className="profile-kicker">Documents</span><h3>Contrats</h3></div><span>{visibleRecords.length}</span></div>
        <label className="profile-private-list-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher…" /></label>
        <div>{visibleRecords.map((record) => <button key={record.id} type="button" className={record.id === selected?.id ? "is-active" : ""} onClick={() => setSelectedId(record.id)}><span><record.icon size={17} /></span><span><strong>{record.title}</strong><small>{record.subtitle}</small><em>{record.meta}</em></span><i>{resolvedIds.includes(record.id) ? "Traité" : record.status}</i><ChevronRight size={14} /></button>)}</div>
      </aside>
      <article className="profile-private-contract-detail">
        {selected && <><div className="profile-private-contract-detail__heading"><div><span className="profile-kicker">Contrat sélectionné</span><h3>{selected.title}</h3><p>{selected.description}</p></div><span>{resolvedIds.includes(selected.id) ? "Traité" : selected.status}</span></div>
        <div className="profile-private-contract-document"><div className="profile-private-contract-document__top"><span>MW</span><div><strong>MEEWAV · ACCORD NUMÉRIQUE</strong><small>{selected.facts[0][1]}</small></div><FileText size={19} /></div><h4>{selected.title}</h4><p>Le présent accord définit les conditions de participation, de diffusion et de répartition applicables au projet.</p><div className="profile-private-contract-document__lines"><span /><span /><span /><span /></div><div className="profile-private-contract-document__terms">{selected.facts.map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div><div className="profile-private-contract-document__signature"><span><small>Signature de Nox Amani</small><strong>{resolvedIds.includes(selected.id) ? "Signé électroniquement" : "En attente"}</strong></span><i /></div></div>
        <div className="profile-private-contract-detail__actions"><button type="button" className="profile-primary-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && (resolvedIds.includes(selected.id) || selected.status === "Actif" ? onToast(`Contrat « ${selected.title} » téléchargé`) : requestContractDecision("sign"))}><CheckCircle2 size={16} /> {resolvedIds.includes(selected.id) || selected.status === "Actif" ? "Télécharger" : "Signer"}</button><button type="button" className="profile-soft-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onToast(`Contrat « ${selected.title} » téléchargé`)}><Download size={15} /> Télécharger</button><button type="button" className="profile-soft-button is-danger" disabled={!allowDemoActions} onClick={() => requestContractDecision("refuse")}>Refuser</button></div></>}
      </article>
    </section>
  );

  const renderHardwareWorkspace = () => (
    <section className="profile-private-equipment-workspace" aria-label="Inventaire du matériel">
      <div className="profile-private-equipment-toolbar"><label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans l’inventaire…" /></label><span>{recordsByModule.hardware.filter((record) => /prêt|ready|disponible/i.test(record.status)).length} disponibles · {recordsByModule.hardware.filter((record) => /maintenance|vérifier/i.test(record.status)).length} en maintenance</span><button type="button" className="profile-primary-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onOpenQuickAction({ kind: "add-hardware" })}><Plus size={15} /> Ajouter</button></div>
      <aside className="profile-private-equipment-list">{visibleRecords.map((record) => <button key={record.id} type="button" className={record.id === selected?.id ? "is-active" : ""} onClick={() => setSelectedId(record.id)}><span><record.icon size={18} /></span><span><strong>{record.title}</strong><small>{record.subtitle}</small></span><i>{record.status}</i><ChevronRight size={14} /></button>)}</aside>
      <article className="profile-private-equipment-detail">{selected && <><div className="profile-private-equipment-detail__hero"><span><SelectedIcon size={25} /></span><div><small>Équipement sélectionné</small><h3>{selected.title}</h3><p>{selected.description}</p></div><em>{selected.status}</em></div><div className="profile-private-detail__facts">{selected.facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="profile-private-availability"><div><span className="profile-kicker"><CalendarDays size={13} /> Disponibilités</span><h4>{allowDemoActions ? "Semaine du 13 juillet" : "Planning non câblé"}</h4></div>{allowDemoActions ? <div>{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day, index) => <span key={day} className={index === 4 || selected.status === "À vérifier" ? "is-limited" : "is-open"}><strong>{day}</strong><small>{index === 4 || selected.status === "À vérifier" ? "Indispo." : "18–23 h"}</small></span>)}</div> : <p>Le schéma actuel ne contient pas encore de créneaux de disponibilité.</p>}</div><div className="profile-private-detail__actions"><button type="button" className="profile-primary-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onOpenQuickAction({ kind: "edit-hardware", equipmentName: selected.title })}><PencilLine size={15} /> Modifier</button><button type="button" className="profile-soft-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onOpenQuickAction({ kind: "hardware-unavailability", equipmentName: selected.title })}>Signaler une indisponibilité</button></div></>}
      </article>
    </section>
  );

  const renderSecurityWorkspace = () => {
    const securityRecords = recordsByModule.security.filter((record) => !removedIds.includes(record.id));
    const visibleProfileRows = profileVisibilityRows.filter(({ id }) => profileVisibility[id]).length;
    const securityScore = dashboard ? (dashboard.security.emailConfirmed ? 55 : 30) + (dashboard.security.mfaVerifiedFactors > 0 ? 35 : 0) : 92;
    return <section className="profile-private-security-workspace" aria-label="Paramètres et historique de sécurité">
      <article className="profile-private-security-score"><div><span><ShieldCheck size={26} /></span><strong>{securityScore}</strong><small>/ 100</small></div><span><small>Niveau de protection</small><h3>{securityScore >= 85 ? "Sécurité forte" : "Protection à renforcer"}</h3><p>{dashboard ? "Score fondé sur la confirmation e-mail et les facteurs MFA disponibles." : "Aucun comportement inhabituel détecté au cours des 30 derniers jours."}</p></span><button type="button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onToast("Audit terminé : aucun risque critique")}>Relancer l’audit</button></article>
      <article className="profile-private-security-settings"><div className="profile-private-module-section-title"><div><span className="profile-kicker">Vérifications</span><h3>Protection active</h3></div><span>{dashboard ? `${Number(dashboard.security.emailConfirmed) + Number(dashboard.security.mfaVerifiedFactors > 0)} / 2` : "3 / 3"}</span></div>{([
        ["twoFactor", "Double authentification", "Obligatoire pour les connexions sensibles"],
        ["loginAlerts", "Alertes de connexion", "Notification à chaque nouvel appareil"],
        ["payoutLock", "Verrouillage des retraits", "Confirmation renforcée avant versement"],
      ] as const).map(([key, label, detail]) => <button key={key} type="button" disabled={!allowDemoActions} onClick={() => allowDemoActions && setSecuritySettings((current) => ({ ...current, [key]: !current[key] }))}><span><strong>{label}</strong><small>{detail}</small></span><span className={`profile-switch ${(dashboard ? key === "twoFactor" ? dashboard.security.mfaVerifiedFactors > 0 : key === "loginAlerts" ? dashboard.security.emailConfirmed : false : securitySettings[key]) ? "is-on" : ""}`}><i /></span></button>)}</article>
      <article className="profile-private-security-identity">
        <div className="profile-private-module-section-title">
          <div><span className="profile-kicker"><Fingerprint size={13} /> Identité du compte</span><h3>Profil public et visibilité</h3></div>
          <span>{profile.profileCompletion} % complet</span>
        </div>
        <div className="profile-private-security-identity__profile">
          <img src={profile.avatarUrl} alt={`Portrait de ${profile.displayName}`} />
          <div>
            <span>{profile.isVerified ? "Profil vérifié" : "Vérification en attente"}</span>
            <h4>{profile.displayName}</h4>
            <p>{profile.username} · {profile.role} · {profile.city}</p>
          </div>
          <div className="profile-private-security-identity__actions">
            <button type="button" className="profile-soft-button" onClick={onViewerPreview}><Eye size={14} /> Vue visiteur</button>
            <button type="button" className="profile-primary-button" onClick={onEditProfile}><PencilLine size={14} /> Modifier</button>
          </div>
        </div>
        <p className="profile-private-security-identity__bio">{profile.bio}</p>
        <div className="profile-private-security-identity__visibility" aria-label={`${visibleProfileRows} informations publiques sur ${profileVisibilityRows.length}`}>
          {profileVisibilityRows.map(({ id, label, detail }) => (
            <button key={id} type="button" disabled={!allowDemoActions} aria-pressed={profileVisibility[id]} onClick={() => allowDemoActions && onToggleProfileVisibility(id)}>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <span className={`profile-switch ${profileVisibility[id] ? "is-on" : ""}`}><i /></span>
            </button>
          ))}
        </div>
        <div className="profile-private-security-identity__completion"><span style={{ width: `${profile.profileCompletion}%` }} /></div>
      </article>
      <article className="profile-private-security-devices"><div className="profile-private-module-section-title"><div><span className="profile-kicker">Appareils</span><h3>Session connue</h3></div><span>{securityRecords.filter((record) => record.id !== "security-2fa").length}</span></div><div>{securityRecords.filter((record) => record.id !== "security-2fa").map((record) => <div key={record.id}><span><record.icon size={18} /></span><span><strong>{record.title}</strong><small>{record.subtitle} · {record.meta}</small></span><em>Actuel</em><span /></div>)}</div></article>
      <article className="profile-private-security-history"><div className="profile-private-module-section-title"><div><span className="profile-kicker"><Clock3 size={13} /> Historique</span><h3>Dernier événement connu</h3></div><button type="button" disabled><Download size={13} /> Exporter</button></div><ol>{dashboard ? <li><i /><time>{formatPrivateDate(dashboard.security.lastSignInAt)}</time><span><strong>Dernière connexion Supabase</strong><small>Aucun historique détaillé des appareils n’est exposé au navigateur.</small></span></li> : <><li><i /><time>Aujourd’hui · 14:32</time><span><strong>Connexion réussie</strong><small>Chrome · Paris · double authentification validée</small></span></li><li><i /><time>Hier · 22:18</time><span><strong>Application mobile consultée</strong><small>iPhone 17 Pro · Paris</small></span></li></>}</ol></article>
    </section>;
  };

  const renderOrganizationWorkspace = () => (
    <section className="profile-private-organization-workspace" aria-label="Membres, rôles et permissions">
      <aside className="profile-private-organization-members"><div className="profile-private-module-section-title"><div><span className="profile-kicker">Équipe</span><h3>{dashboard ? "Invitations" : "Membres"}</h3></div><span>{visibleRecords.length}</span></div><label className="profile-private-list-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher…" /></label><div>{visibleRecords.map((record) => <button key={record.id} type="button" className={record.id === selected?.id ? "is-active" : ""} onClick={() => setSelectedId(record.id)}><span>{record.title.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{record.title}</strong><small>{record.subtitle}</small><em>{record.meta}</em></span><i>{record.status}</i><ChevronRight size={14} /></button>)}</div><button type="button" className="profile-primary-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onOpenQuickAction({ kind: "invite-member" })}><UserPlus size={15} /> Inviter un membre</button></aside>
      <article className="profile-private-organization-detail">{selected && <><div className="profile-private-organization-detail__person"><span>{selected.title.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><small>{dashboard ? "Invitation sélectionnée" : "Membre sélectionné"}</small><h3>{selected.title}</h3><p>{selected.description}</p></div><em>{selected.status}</em></div><div className="profile-private-organization-role"><span><small>Rôle actuel</small><strong>{selected.value}</strong></span><span><small>Dernière activité</small><strong>{selected.facts[2][1]}</strong></span><span><small>Double authentification</small><strong>{selected.facts[3][1]}</strong></span></div><div className="profile-private-permission-matrix"><div><span className="profile-kicker">Permissions</span><h4>Périmètre d’accès</h4></div>{["Profil public", "Médiathèque", "Finances", "Contrats", "Matériel", "Organisation"].map((permission, index) => { const granted = dashboard ? selected.facts[1][1].toLocaleLowerCase("fr").includes(permission.toLocaleLowerCase("fr")) : index < (selected.id === "member-maya" ? 6 : selected.id === "member-nadir" ? 3 : 2); return <div key={permission}><span>{permission}</span><i className={granted ? "is-granted" : ""}>{granted ? <Check size={13} /> : "—"}</i></div>; })}</div><div className="profile-private-detail__actions"><button type="button" className="profile-primary-button" disabled={!allowDemoActions} onClick={() => allowDemoActions && onOpenQuickAction({ kind: "edit-member", memberName: selected.title })}><PencilLine size={15} /> Modifier le rôle</button><button type="button" className="profile-soft-button is-danger" disabled={!allowDemoActions} onClick={requestMemberRemoval}>Retirer l’accès</button></div></>}
      </article>
    </section>
  );

  const moduleEmptyCopy: Record<SpaceModuleId, [string, string]> = {
    wallet: ["Aucun mouvement financier", "Le portefeuille restera en lecture seule jusqu’à l’arrivée d’une transaction réelle."],
    transactions: ["Aucune transaction", "Les mouvements créés par les futurs piliers apparaîtront ici."],
    contracts: ["Aucun contrat", "Aucun document contractuel n’est associé à ce profil."],
    hardware: ["Aucun matériel", "L’inventaire privé ne contient encore aucun équipement."],
    security: ["Sécurité indisponible", "Les informations de sécurité du compte ne sont pas disponibles."],
    organization: ["Aucune invitation", "Aucun membre actif n’est exposé par le schéma actuel et aucune invitation n’est en attente."],
  };
  const moduleIsEmpty = dataStatus === "ready" && recordsByModule[moduleId].length === 0;
  const headerActionDisabled = (!allowDemoActions && moduleId !== "transactions")
    || (moduleId === "transactions" && transactionRows.length === 0);

  return (
    <div className={`profile-private-route ${presentation === "embedded" ? "is-embedded" : ""}`} style={{ "--private-route-accent": config.accent } as CSSProperties}>
      {presentation === "standalone" && <div className="profile-private-route__topline"><button type="button" className="profile-private-route__back" onClick={onBack}><ArrowLeft size={16} /> Vue d’ensemble</button><span>Synchronisé à l’instant</span></div>}

      <header className="profile-private-module-command" style={{ viewTransitionName: `private-module-${moduleId}` } as CSSProperties}>
        <div className="profile-private-module-command__identity"><span className="profile-private-route__mark"><ModuleIcon size={21} /></span><span><small>{config.eyebrow}</small><h2>{moduleData?.label}</h2><p>{config.intro}</p></span></div>
        <button type="button" className="profile-primary-button profile-private-route__action" disabled={headerActionDisabled} title={headerActionDisabled ? "Cette action attend encore un service serveur sécurisé." : undefined} onClick={handleHeaderAction}>
          {moduleId === "organization" || moduleId === "hardware" || moduleId === "wallet" ? <Plus size={16} /> : moduleId === "transactions" ? <Download size={16} /> : <ArrowRight size={16} />}
          {config.actionLabel}
        </button>
      </header>

      <div className="profile-private-route__scroll-region" tabIndex={0} aria-label={`Contenu ${moduleData?.label ?? "du module"}`}>
        {dataStatus === "loading" ? (
          <div className="profile-private-table-empty" role="status" aria-live="polite"><Clock3 size={22} /><strong>Synchronisation de l’espace privé…</strong><span>Lecture des données sécurisées du propriétaire.</span></div>
        ) : dataStatus === "error" ? (
          <div className="profile-private-table-empty" role="alert"><ShieldCheck size={22} /><strong>Impossible de charger cet espace</strong><span>{dataError}</span><button type="button" className="profile-soft-button" onClick={onRetry}>Réessayer</button></div>
        ) : moduleIsEmpty ? (
          <div className="profile-private-table-empty"><Search size={22} /><strong>{moduleEmptyCopy[moduleId][0]}</strong><span>{moduleEmptyCopy[moduleId][1]}</span></div>
        ) : (
          <>
            {moduleId === "wallet" && renderWalletWorkspace()}
            {moduleId === "transactions" && renderTransactionsWorkspace()}
            {moduleId === "contracts" && renderContractsWorkspace()}
            {moduleId === "hardware" && renderHardwareWorkspace()}
            {moduleId === "security" && renderSecurityWorkspace()}
            {moduleId === "organization" && renderOrganizationWorkspace()}
          </>
        )}
      </div>

      {confirmation && <ConfirmationModal state={confirmation} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />}
    </div>
  );
}

export function PrivateQuickActionPanel({ action, onDone, onCancel }: { action: PrivateQuickAction; onDone: (message: string) => void; onCancel: () => void }) {
  if (action.kind === "transaction-detail") {
    const transaction = action.transaction;
    return (
      <form className="profile-private-quick-form profile-private-transaction-panel" onSubmit={(event) => { event.preventDefault(); if (!action.readOnly) onDone("Transaction mise à jour"); }}>
        <div className="profile-private-quick-form__intro"><span><ReceiptText size={23} /></span><div><span className="profile-kicker">Consultation rapide</span><h3>{transaction.title}</h3><p>{transaction.reference} · {transaction.date}</p></div></div>
        <div className="profile-private-transaction-panel__amount"><span><small>Montant</small><strong>{transaction.amount}</strong></span><em className={transaction.status === "En attente" ? "is-pending" : ""}>{transaction.status}</em></div>
        <div className="profile-private-transaction-panel__facts"><span><small>Référence</small><strong>{transaction.reference}</strong></span><span><small>Type</small><strong>{transaction.category}</strong></span><span><small>Date</small><strong>{transaction.date}</strong></span></div>
        {!action.readOnly && <div className="profile-form-section"><label><span>Catégorie</span><select defaultValue={transaction.category === "Dépense" ? "business" : "creative"}><option value="creative">Revenu créatif</option><option value="business">Dépense professionnelle</option><option value="royalties">Droits et royalties</option><option value="other">Autre</option></select></label><label><span>Note interne</span><textarea placeholder="Ajouter une note visible uniquement par ton équipe…" /></label></div>}
        <div className="profile-dialog-actions"><button type="button" className="profile-soft-button" onClick={onCancel}><X size={15} /> Fermer</button>{!action.readOnly && <button type="submit" className="profile-primary-button"><Check size={16} /> Enregistrer</button>}</div>
      </form>
    );
  }

  const isMember = action.kind === "invite-member" || action.kind === "edit-member";
  const isHardware = action.kind === "add-hardware" || action.kind === "edit-hardware";
  const isUnavailability = action.kind === "hardware-unavailability";
  const title = action.kind === "invite-member"
    ? "Inviter un membre"
    : action.kind === "edit-member"
      ? `Modifier ${action.memberName}`
      : action.kind === "payment-method"
        ? "Ajouter un compte de versement"
        : action.kind === "add-hardware"
          ? "Ajouter du matériel"
          : action.kind === "hardware-unavailability"
            ? `Indisponibilité · ${action.equipmentName}`
            : `Modifier ${action.equipmentName}`;
  const intro = isMember
    ? "Définis un rôle clair et limite l’accès au strict nécessaire."
    : isHardware || isUnavailability
      ? "Renseigne l’équipement et sa disponibilité sans quitter ton espace de travail."
      : "Le compte sera vérifié avant de pouvoir recevoir un retrait.";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onDone(action.kind === "invite-member" ? "Invitation envoyée" : action.kind === "edit-member" ? "Permissions du membre enregistrées" : action.kind === "payment-method" ? "Compte envoyé en vérification" : action.kind === "hardware-unavailability" ? "Indisponibilité enregistrée" : "Matériel enregistré");
  };

  return (
    <form className="profile-private-quick-form" onSubmit={submit}>
      <div className="profile-private-quick-form__intro">
        <span>{isMember ? <UserPlus size={23} /> : isHardware || isUnavailability ? <Wrench size={23} /> : <Building2 size={23} />}</span>
        <div><span className="profile-kicker">Action rapide</span><h3>{title}</h3><p>{intro}</p></div>
      </div>

      {isMember && (
        <div className="profile-form-section">
          {action.kind === "invite-member" && <label><span>Adresse e-mail</span><input type="email" required placeholder="membre@exemple.fr" /></label>}
          <label><span>Rôle</span><select defaultValue={action.kind === "edit-member" ? "admin" : "contributor"}><option value="admin">Administrateur</option><option value="contributor">Contributeur</option><option value="accounting">Comptabilité</option><option value="viewer">Lecture seule</option></select></label>
          <div className="profile-private-quick-form__permissions"><span>Périmètre d’accès</span>{["Profil public", "Médiathèque", "Finances", "Contrats", "Organisation"].map((label, index) => <label key={label}><input type="checkbox" defaultChecked={index < 2} /><span>{label}</span></label>)}</div>
        </div>
      )}

      {isHardware && (
        <div className="profile-form-section profile-form-grid">
          <label><span>Nom de l’équipement</span><input required defaultValue={action.kind === "edit-hardware" ? action.equipmentName : ""} placeholder="Ex. Nord Stage 4" /></label>
          <label><span>Catégorie</span><select defaultValue="instrument"><option value="instrument">Instrument</option><option value="audio">Interface audio</option><option value="micro">Microphone</option><option value="other">Autre</option></select></label>
          <label><span>État</span><select defaultValue="ready"><option value="ready">Disponible</option><option value="maintenance">Maintenance</option><option value="hidden">Non publié</option></select></label>
          <label><span>Emplacement</span><input defaultValue="Studio A" /></label>
        </div>
      )}

      {isUnavailability && (
        <div className="profile-form-section profile-form-grid">
          <label><span>Début</span><input type="datetime-local" required defaultValue="2026-07-17T09:00" /></label>
          <label><span>Fin estimée</span><input type="datetime-local" required defaultValue="2026-07-18T18:00" /></label>
          <label className="is-wide"><span>Motif</span><select defaultValue="maintenance"><option value="maintenance">Maintenance</option><option value="booking">Réservation externe</option><option value="personal">Indisponibilité temporaire</option></select></label>
        </div>
      )}

      {action.kind === "payment-method" && (
        <div className="profile-form-section profile-form-grid">
          <label><span>Titulaire du compte</span><input required defaultValue="Nox Amani" /></label>
          <label><span>Pays</span><select defaultValue="FR"><option value="FR">France</option><option value="BE">Belgique</option><option value="CH">Suisse</option></select></label>
          <label className="is-wide"><span>IBAN</span><input required placeholder="FR76 0000 0000 0000 0000 0000 000" /></label>
        </div>
      )}

      <div className="profile-dialog-actions"><button type="button" className="profile-soft-button" onClick={onCancel}><X size={15} /> Annuler</button><button type="submit" className="profile-primary-button"><Check size={16} /> Enregistrer</button></div>
    </form>
  );
}
