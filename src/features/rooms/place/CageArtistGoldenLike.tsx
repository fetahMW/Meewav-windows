import { useEffect, useState } from "react";
import { RotateCw, Star } from "lucide-react";
import type { RoomPerson } from "../tools/roomTools.types";
import { useCageGoldenLikes } from "./CageGoldenLikeContext";
import RoomGoldenLikeReactions from "./RoomGoldenLikeReactions";

export default function CageArtistGoldenLike({ person, canEngage, viewerId }: { person: RoomPerson; canEngage: boolean; viewerId?: string }) {
  const quota = useCageGoldenLikes();
  const load = quota?.load;
  const day = quota?.day;
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    if (load && canEngage && person.id !== viewerId) void load(person.id, attempt > 0).then(state => { if (active) setFailed(!state); });
    return () => { active = false; };
  }, [attempt, canEngage, day, load, person.id, viewerId]);
  const state = quota?.states[person.id];
  const self = person.id === viewerId;
  if (!state && canEngage && !self && quota) return <div className="shorts-reactions shorts-reactions--compact" role="group" aria-label={`Golden Like pour ${person.name}`}>
    <button type="button" className="shorts-reaction shorts-reaction--golden" disabled={!failed}
      aria-label={failed ? `Réessayer de charger le Golden Like pour ${person.name}` : `Chargement du Golden Like pour ${person.name}`}
      title={failed ? "Disponibilité non confirmée · Réessayer" : "Vérification de la disponibilité"}
      onClick={() => setAttempt(value => value + 1)}><span className="shorts-reaction__icon"><Star aria-hidden="true" /></span>{failed ? <RotateCw className="shorts-reaction__retry" aria-hidden="true" /> : null}</button>
  </div>;
  return <RoomGoldenLikeReactions key={person.id} variant="compact" goldenOnly artistName={person.name}
    ariaLabel={`Golden Like pour ${person.name}`} likeCount={0} liked={false}
    goldenLikeCount={state?.goldenLikesCount ?? 0}
    goldenGiven={quota?.givenId === person.id || Boolean(state?.givenToThisArtistToday)}
    goldenUnavailable={!state || Boolean(quota?.pending || quota?.used || !state.availableToday)}
    readOnly={!canEngage || self || !quota}
    onGiveGoldenLike={() => quota?.giveArtist(person.id) ?? false} />;
}
