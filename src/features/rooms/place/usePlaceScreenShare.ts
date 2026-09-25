import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ScreenShareSelectionOptions = {
  includeAudio?: boolean;
};

type UsePlaceScreenShareOptions = {
  roomId: string;
  roomIsLive: boolean;
  onNotice: (message: string) => void;
};

type StreamCleanup = {
  stream: MediaStream;
  detach: () => void;
};

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => {
    if (track.readyState !== "ended") track.stop();
  });
}

function hasLiveVideo(stream: MediaStream) {
  return stream.getVideoTracks().some((track) => track.readyState !== "ended");
}

export function describeDisplayMediaError(error: unknown) {
  if (error instanceof TypeError) {
    return "Le navigateur refuse les réglages de capture demandés.";
  }
  if (!(error instanceof DOMException)) {
    return "Impossible d’ouvrir la sélection de partage d’écran.";
  }

  switch (error.name) {
    case "AbortError":
      return "Sélection du partage d’écran interrompue.";
    case "NotAllowedError":
      return "Sélection du partage d’écran refusée ou annulée.";
    case "NotFoundError":
      return "Aucune source d’écran partageable n’a été trouvée.";
    case "NotReadableError":
      return "Cette source ne peut pas être capturée. Fermez l’application qui la bloque puis réessayez.";
    case "InvalidStateError":
      return "Ouvrez le sélecteur depuis le bouton de partage d’écran.";
    case "OverconstrainedError":
      return "Le navigateur refuse les réglages de capture demandés.";
    default:
      return "Impossible de démarrer la capture d’écran.";
  }
}

export function usePlaceScreenShare({ roomId, roomIsLive, onNotice }: UsePlaceScreenShareOptions) {
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [published, setPublished] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [streamRevision, setStreamRevision] = useState(0);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const scopeRef = useRef(`${roomId}:${roomIsLive ? "live" : "closed"}`);
  const currentRef = useRef<StreamCleanup | null>(null);
  const noticeRef = useRef(onNotice);
  scopeRef.current = `${roomId}:${roomIsLive ? "live" : "closed"}`;
  noticeRef.current = onNotice;

  const releaseCurrent = useCallback((stopTracks = true) => {
    const current = currentRef.current;
    if (!current) return;
    currentRef.current = null;
    current.detach();
    if (stopTracks) stopStream(current.stream);
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    releaseCurrent();
    if (!mountedRef.current) return;
    setPreviewStream(null);
    setPublished(false);
    setRequesting(false);
    setStreamRevision((value) => value + 1);
  }, [releaseCurrent]);

  const installStream = useCallback((stream: MediaStream) => {
    const videoTracks = stream.getVideoTracks();
    const onInactive = () => {
      if (currentRef.current?.stream !== stream) return;
      reset();
    };
    const trackHandlers = stream.getTracks().map((track) => {
      const onEnded = () => {
        if (currentRef.current?.stream !== stream) return;
        if (track.kind === "video" || !hasLiveVideo(stream)) {
          reset();
          return;
        }
        setStreamRevision((value) => value + 1);
      };
      track.addEventListener("ended", onEnded);
      return { track, onEnded };
    });

    stream.addEventListener("inactive", onInactive);
    currentRef.current = {
      stream,
      detach: () => {
        stream.removeEventListener("inactive", onInactive);
        trackHandlers.forEach(({ track, onEnded }) => track.removeEventListener("ended", onEnded));
      },
    };
  }, [reset]);

  const selectSource = useCallback(async ({ includeAudio = true }: ScreenShareSelectionOptions = {}) => {
    if (!roomIsLive) {
      noticeRef.current("Le partage d’écran est disponible uniquement pendant le live.");
      return null;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      noticeRef.current("Le partage d’écran n’est pas disponible dans ce navigateur.");
      return null;
    }

    const generation = ++generationRef.current;
    const requestScope = scopeRef.current;
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: includeAudio,
      });
      const requestIsCurrent = mountedRef.current
        && generationRef.current === generation
        && scopeRef.current === requestScope
        && roomIsLive;
      if (!requestIsCurrent) {
        stopStream(stream);
        return null;
      }
      if (!hasLiveVideo(stream)) {
        stopStream(stream);
        noticeRef.current("La source choisie ne fournit aucune image partageable.");
        return null;
      }

      releaseCurrent();
      installStream(stream);
      setPreviewStream(stream);
      setPublished(false);
      setStreamRevision((value) => value + 1);
      return stream;
    } catch (error) {
      if (mountedRef.current && generationRef.current === generation && scopeRef.current === requestScope) {
        noticeRef.current(describeDisplayMediaError(error));
      }
      return null;
    } finally {
      if (mountedRef.current && generationRef.current === generation && scopeRef.current === requestScope) {
        setRequesting(false);
      }
    }
  }, [installStream, releaseCurrent, roomIsLive]);

  const publish = useCallback(() => {
    const stream = currentRef.current?.stream;
    if (!stream || !hasLiveVideo(stream)) {
      reset();
      noticeRef.current("Choisissez d’abord une source à prévisualiser.");
      return;
    }
    setPublished(true);
  }, [reset]);

  useEffect(() => {
    generationRef.current += 1;
    releaseCurrent();
    setPreviewStream(null);
    setPublished(false);
    setRequesting(false);
    setStreamRevision((value) => value + 1);
  }, [releaseCurrent, roomId, roomIsLive]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      releaseCurrent();
    };
  }, [releaseCurrent]);

  const hasAudio = useMemo(() => (
    previewStream?.getAudioTracks().some((track) => track.readyState !== "ended") ?? false
  // streamRevision intentionally refreshes track.readyState-derived metadata.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [previewStream, streamRevision]);

  const sourceLabel = useMemo(() => {
    const surface = previewStream?.getVideoTracks()[0]?.getSettings?.().displaySurface;
    if (surface === "window") return "Fenêtre";
    if (surface === "browser") return "Onglet du navigateur";
    if (surface === "monitor") return "Écran";
    return previewStream ? "Source sélectionnée" : null;
  // streamRevision intentionally refreshes settings exposed after capture starts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStream, streamRevision]);

  return {
    previewStream,
    publishedStream: published ? previewStream : null,
    isPublished: published,
    isRequesting: requesting,
    hasAudio,
    sourceLabel,
    selectSource,
    publish,
    stop: reset,
  };
}
