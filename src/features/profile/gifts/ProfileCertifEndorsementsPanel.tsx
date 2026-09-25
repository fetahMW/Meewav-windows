import { BadgeCheck, Eye, EyeOff, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  profileCertifEndorsementsRepository,
  type ProfileCertifEndorsement,
  type ProfileCertifStateAction,
  type ProfileCertifSummary,
} from "./profileCertifEndorsements.service";
import "./ProfileCertifEndorsementsPanel.css";

type Props = {
  profileId: string | null;
  onDone: (message: string) => void;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const certifDateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function certifDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date indisponible" : certifDateFormatter.format(date);
}

function stateLabel(endorsement: ProfileCertifEndorsement) {
  if (endorsement.state === "withdrawn") return "Retirée par l’émetteur";
  if (endorsement.state === "hidden_by_recipient") return "Masquée du profil";
  if (endorsement.state === "moderated") return "Retirée après modération";
  return endorsement.direction === "sent" ? "Éloge actif" : "Visible sur mon profil";
}

export default function ProfileCertifEndorsementsPanel({ profileId, onDone }: Props) {
  const [loadState, setLoadState] = useState<LoadState>(profileId ? "loading" : "idle");
  const [summary, setSummary] = useState<ProfileCertifSummary | null>(null);
  const [endorsements, setEndorsements] = useState<ProfileCertifEndorsement[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!profileId) {
      setLoadState("idle");
      setSummary(null);
      setEndorsements([]);
      return () => { active = false; };
    }
    setLoadState("loading");
    void Promise.all([
      profileCertifEndorsementsRepository.getSummary(profileId),
      profileCertifEndorsementsRepository.listMine(profileId),
    ]).then(([nextSummary, nextEndorsements]) => {
      if (!active) return;
      setSummary(nextSummary);
      setEndorsements(nextEndorsements);
      setLoadState("ready");
    }).catch(() => {
      if (!active) return;
      setLoadState("error");
    });
    return () => { active = false; };
  }, [profileId]);

  const visibleEndorsements = useMemo(() => endorsements.slice(0, 8), [endorsements]);
  if (loadState === "idle") return null;
  if (loadState === "ready" && !summary && endorsements.length === 0) return null;

  const changeState = async (endorsement: ProfileCertifEndorsement, action: ProfileCertifStateAction) => {
    if (!profileId || updatingId) return;
    setUpdatingId(endorsement.id);
    try {
      const result = await profileCertifEndorsementsRepository.setMyEndorsementState(endorsement.id, action);
      setEndorsements((current) => current.map((entry) => (
        entry.id === endorsement.id ? { ...entry, state: result.state } : entry
      )));
      setSummary(await profileCertifEndorsementsRepository.getSummary(profileId));
      onDone(action === "withdraw"
        ? "Ton éloge a été retiré"
        : action === "hide"
          ? "Cette validation est masquée de ton profil"
          : "Cette validation est de nouveau visible");
    } catch {
      onDone("La visibilité de cette validation n’a pas pu être modifiée");
    } finally {
      setUpdatingId(null);
    }
  };

  return <section className="profile-certif-panel" aria-label="Validations La Certif">
    <header>
      <span className="profile-certif-panel__icon"><BadgeCheck size={20} /></span>
      <div><span className="profile-kicker">La Certif</span><h4>Validations de la communauté</h4><p>{summary?.uniqueEndorsers ?? 0} émetteur{summary?.uniqueEndorsers === 1 ? "" : "s"} unique{summary?.uniqueEndorsers === 1 ? "" : "s"}</p></div>
      <span className="profile-certif-panel__safety"><ShieldAlert size={13} /> Non officielle</span>
    </header>
    <p className="profile-certif-panel__disclaimer">{summary?.disclaimer ?? "Éloges signées par des membres ; ne constituent pas une vérification officielle MeeWav."}</p>
    {loadState === "loading" ? <p className="profile-certif-panel__state" role="status">Synchronisation des validations…</p> : null}
    {loadState === "error" ? <p className="profile-certif-panel__state is-error" role="alert">Les validations sont momentanément indisponibles.</p> : null}
    {loadState === "ready" && visibleEndorsements.length > 0 ? <div className="profile-certif-panel__list">
      {visibleEndorsements.map((endorsement) => <article key={endorsement.id} className={`is-${endorsement.state}`}>
        <span className="profile-certif-panel__avatar">
          {endorsement.counterpartAvatarUrl ? <img src={endorsement.counterpartAvatarUrl} alt="" /> : <BadgeCheck size={17} />}
        </span>
        <div>
          <strong>{endorsement.direction === "sent" ? "Je valide" : "Me valide"} · {endorsement.counterpartDisplayName}</strong>
          <small>{stateLabel(endorsement)} · {certifDate(endorsement.endorsedAt)}</small>
          {endorsement.direction === "received" ? <em>Grade {endorsement.senderGradeLevelSnapshot} au moment de l’éloge{endorsement.senderVerifiedSnapshot ? " · compte vérifié" : ""}</em> : null}
        </div>
        {endorsement.direction === "sent" && ["active", "hidden_by_recipient"].includes(endorsement.state) ? <button type="button" disabled={updatingId === endorsement.id} onClick={() => void changeState(endorsement, "withdraw")}><RotateCcw size={13} /> Retirer mon éloge</button> : null}
        {endorsement.direction === "received" && endorsement.state === "active" ? <button type="button" disabled={updatingId === endorsement.id} onClick={() => void changeState(endorsement, "hide")}><EyeOff size={13} /> Masquer</button> : null}
        {endorsement.direction === "received" && endorsement.state === "hidden_by_recipient" ? <button type="button" disabled={updatingId === endorsement.id} onClick={() => void changeState(endorsement, "restore_visibility")}><Eye size={13} /> Réafficher</button> : null}
      </article>)}
    </div> : null}
  </section>;
}
