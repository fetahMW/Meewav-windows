import { useEffect, useState } from "react";
import PlaceScreenShareToolCard from "../../place/PlaceScreenShareToolCard";
import type { ScreenShareToolProps } from "./ScreenShareToolPanel";

type ClasseScreenShareToolPanelProps = ScreenShareToolProps & {
  host: { displayName: string; avatarUrl: string };
};

export default function ClasseScreenShareToolPanel(props: ClasseScreenShareToolPanelProps) {
  const [includeDeviceAudio, setIncludeDeviceAudio] = useState(true);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!props.published) {
      setStartedAt(null);
      return;
    }
    setStartedAt((current) => current ?? Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [props.published]);

  const elapsed = startedAt ? Math.max(0, Math.floor((clock - startedAt) / 1_000)) : 0;
  const chooseSource = async (options?: { includeAudio?: boolean }) => {
    if (selectionBusy || props.disabled || props.requesting) return;
    setSelectionBusy(true);
    try {
      await props.onSelect(options);
    } finally {
      setSelectionBusy(false);
    }
  };

  return <PlaceScreenShareToolCard
    roomLabel={props.roomLabel}
    disabled={props.disabled}
    host={props.host}
    previewStream={props.previewStream}
    published={props.published}
    requesting={props.requesting}
    hasAudio={props.hasAudio}
    sourceLabel={props.sourceLabel}
    elapsedSeconds={elapsed}
    includeDeviceAudio={includeDeviceAudio}
    interactionBusy={selectionBusy}
    selectionBusy={selectionBusy}
    onIncludeDeviceAudioChange={setIncludeDeviceAudio}
    onSelect={chooseSource}
    onPublish={props.onPublish}
    onStop={props.onStop}
  />;
}
