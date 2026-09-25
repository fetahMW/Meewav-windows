import { useEffect, useRef, useState } from "react";
import GoldenLikeConfirmationDialog from "../../goldenLikes/GoldenLikeConfirmationDialog";
import ShortsReactionButtons, { type ShortsReactionButtonsProps } from "../../shorts/ShortsReactionButtons";
import LiveActionBurst from "./LiveActionBurst";
import "./room-golden-like.css";

type Props = Omit<ShortsReactionButtonsProps, "onGiveGoldenLike"> & { onGiveGoldenLike: () => boolean | Promise<boolean>; onBurstChange?: (visible: boolean) => void };
export default function RoomGoldenLikeReactions(props: Props) {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [error, setError] = useState(""), [burst, setBurst] = useState(false);
  const submitting = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    props.onBurstChange?.(burst);
    return () => props.onBurstChange?.(false);
  }, [burst, props.onBurstChange]);
  useEffect(() => {
    if (!burst) return;
    const timeout = setTimeout(() => setBurst(false), 1500);
    return () => clearTimeout(timeout);
  }, [burst]);
  const confirm = async () => {
    if (submitting.current || props.goldenUnavailable || props.goldenGiven || props.readOnly) return;
    submitting.current = true; setPending(true); setError("");
    try {
      const sent = await props.onGiveGoldenLike();
      if (!mounted.current) return;
      if (!sent) { setError("Le Golden Like n’a pas été envoyé. Vérifie sa disponibilité et réessaie."); return; }
      setOpen(false); setBurst(true);
    } catch { if (mounted.current) setError("Le Golden Like n’a pas été envoyé. Réessaie."); }
    finally { submitting.current = false; if (mounted.current) setPending(false); }
  };
  return <>
    <ShortsReactionButtons {...props} goldenUnavailable={props.goldenUnavailable || pending} goldenFeedback={burst ? <LiveActionBurst kind="golden" /> : undefined} onGiveGoldenLike={() => {
      setError(""); setOpen(true);
    }} />
    {open ? <GoldenLikeConfirmationDialog artistName={props.artistName} pending={pending}
      unavailable={props.goldenUnavailable || props.goldenGiven} error={error}
      onClose={() => setOpen(false)} onConfirm={() => void confirm()} /> : null}
  </>;
}
