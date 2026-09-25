import { BadgeCheck, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  profileCertifEndorsementsRepository,
  type ProfileCertifSummary,
} from "./profileCertifEndorsements.service";
import "./ProfileCertifPublicSummary.css";

export default function ProfileCertifPublicSummary({ profileId, profileName }: {
  profileId: string;
  profileName: string;
}) {
  const [summary, setSummary] = useState<ProfileCertifSummary | null>(null);

  useEffect(() => {
    let active = true;
    void profileCertifEndorsementsRepository.getSummary(profileId).then((value) => {
      if (active) setSummary(value);
    }).catch(() => {
      if (active) setSummary(null);
    });
    return () => { active = false; };
  }, [profileId]);

  if (!summary || summary.uniqueEndorsers === 0) return null;

  return <article className="profile-viewer-certif-card" aria-label={`Validations communautaires de ${profileName}`}>
    <header>
      <span><BadgeCheck aria-hidden="true" /></span>
      <div><small>LA CERTIF · ÉLOGES SIGNÉS</small><h3>{summary.uniqueEndorsers} membre{summary.uniqueEndorsers > 1 ? "s" : ""} valide{summary.uniqueEndorsers > 1 ? "nt" : ""} ce talent</h3></div>
      <em><ShieldAlert aria-hidden="true" /> Non officielle</em>
    </header>
    <dl>
      <div><dt>Émetteurs uniques</dt><dd>{summary.uniqueEndorsers}</dd></div>
      <div><dt>Grades 4 à 6</dt><dd>{summary.highGradeEndorsers}</dd></div>
      <div><dt>Comptes vérifiés</dt><dd>{summary.verifiedEndorsers}</dd></div>
    </dl>
    {summary.recentPublicEndorsers.length > 0 ? <div className="profile-viewer-certif-card__people">
      {summary.recentPublicEndorsers.slice(0, 4).map((endorser) => <span key={`${endorser.displayName}:${endorser.endorsedAt}`} title={`${endorser.displayName} · grade ${endorser.gradeLevelAtEndorsement}`}>
        {endorser.avatarUrl ? <img src={endorser.avatarUrl} alt="" loading="lazy" /> : <BadgeCheck aria-hidden="true" />}
        <strong>{endorser.displayName}</strong>
        <small>Grade {endorser.gradeLevelAtEndorsement}</small>
      </span>)}
    </div> : null}
    <p>{summary.disclaimer}</p>
  </article>;
}
