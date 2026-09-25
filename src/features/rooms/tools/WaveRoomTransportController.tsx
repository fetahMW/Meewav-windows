import { useEffect, useMemo } from "react";
import type { PlaceRoomState } from "../place/place.types";
import { submissionAsset, useWaveTransport } from "../wave-transport/WaveTransportProvider";
import { uploadWaveAudienceFile, validateWaveAudienceFile } from "./audience/waveAudienceUpload.service";
import { useRoomTools } from "./useRoomTools";
import { hasAudibleWaveSolo, isWaveLayerAudible } from "./waveLayerMix";
import { WAVE_LOOP_CATEGORIES } from "./waveLoopCategories";
import { assertWaveBaseDuration, waveBarsForImportedDuration } from "./waveImportGrid";

/** Keeps the Wave clock and import routing alive independently of the visible
 * Studio tab. UI panels may mount/unmount without ever owning audio state. */
export default function WaveRoomTransportController({ room }: { room: PlaceRoomState }) {
  const transport = useWaveTransport();
  const roomProfile = room.currentUserProfile ?? room.host;
  const profile = useMemo(() => room.source === "demo" ? {
      ...roomProfile,
      id: "puff-wave-host",
      displayName: "Puff",
      handle: "@puff",
      role: "Beatmaker",
      avatarUrl: "/assets/orbit/founder-puff.png",
    } : roomProfile,
  [room.source, roomProfile]);
  const accountId = profile.id;
  const { state, execute } = useRoomTools({
    roomType: "wave",
    roomId: room.id,
    role: "host",
    accountId,
    source: room.source,
  });
  const wave = state?.wave;

  useEffect(() => {
    if (!transport || !wave) return;
    transport.setWave(wave);
    transport.engine.setGrid({ ...transport.engine.getSnapshot().grid, bpm: wave.baseLoop.bpm });
    const solo = hasAudibleWaveSolo(wave.layers);
    const baseLayer = wave.layers.find((layer) => !layer.submissionId);
    transport.engine.setLayerGain("base", baseLayer?.gain ?? .82);
    transport.engine.setReferenceMix(
      !baseLayer || isWaveLayerAudible(baseLayer, solo),
      Boolean(baseLayer && (!baseLayer.active || baseLayer.muted)),
    );
    void transport.engine.syncLayers(wave.layers.flatMap((layer) => {
      const submission = wave.submissions.find((item) => item.id === layer.submissionId
        && (!layer.submissionVersion || item.version === layer.submissionVersion));
      if (!submission || !(submission.lifecycleStatus === "ACCEPTED" || submission.status === "accepted")) return [];
      return [{ asset: submissionAsset(submission), gain: layer.gain ?? .82, audible: isWaveLayerAudible(layer, solo) }];
    }));
    const candidate = transport.engine.getSnapshot().candidate;
    if (candidate && !wave.submissions.some((item) => item.id === candidate.id
      && !["REMOVED", "SUPERSEDED", "REJECTED"].includes(item.lifecycleStatus ?? ""))) void transport.select(null);
  }, [transport, wave]);

  useEffect(() => {
    if (!transport || !wave) return;
    return transport.registerImportHandler(async ({ audio, destination, category }) => {
      const mimeType = validateWaveAudienceFile(audio.file);
      const mediaPath = room.source === "live"
        ? await uploadWaveAudienceFile({ roomId: room.id, accountId, file: audio.file })
        : undefined;
      const mediaUrl = room.source === "demo" ? audio.src : undefined;
      const title = audio.title.trim() || audio.file.name.replace(/\.[^.]+$/, "") || "Production importée";
      const bars = destination === "base"
        ? assertWaveBaseDuration({
          durationSeconds: audio.durationSeconds,
          bpm: wave.baseLoop.bpm,
          baseBars: wave.baseLoop.bars,
        })
        : waveBarsForImportedDuration({
          durationSeconds: audio.durationSeconds,
          bpm: wave.baseLoop.bpm,
          fallbackBars: wave.baseLoop.bars,
        });
      const gridDuration = 60 / wave.baseLoop.bpm * 4 * bars;
      const media = {
        title,
        fileName: audio.file.name,
        fileSize: audio.file.size,
        mimeType,
        mediaUrl,
        mediaPath,
        durationSeconds: audio.durationSeconds > 0 ? audio.durationSeconds : gridDuration,
      };
      const categoryLabel = WAVE_LOOP_CATEGORIES.find((item) => item.id === category)?.label ?? "Nappes";
      if (destination === "base") {
        await execute({ type: "wave.base.replace", baseLoop: { ...wave.baseLoop, ...media, kind: categoryLabel, bars: bars as 4 | 8 } });
        return;
      }
      await execute({
        type: "wave.submission.importToVote",
        submission: {
          id: `host-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          contributor: {
            id: profile.id,
            name: profile.displayName,
            avatarUrl: profile.avatarUrl,
            role: profile.role || "Beatmaker",
            microphone: "ready",
            camera: "ready",
          },
          title,
          instrument: categoryLabel,
          category,
          bpm: wave.baseLoop.bpm,
          key: wave.baseLoop.key,
          bars,
          durationSeconds: gridDuration,
          fileName: media.fileName,
          fileSize: media.fileSize,
          mimeType: media.mimeType,
          mediaUrl,
          mediaPath,
          submittedAt: new Date().toISOString(),
          status: "analysis",
          lifecycleStatus: "READY_FOR_VOTE",
          rightsConfirmed: true,
          version: 1,
          privateNotes: "Version retravaillée importée par le host depuis le lecteur.",
          creditPublic: true,
          versions: [],
        },
      });
    });
  }, [accountId, execute, profile, room.id, room.source, transport, wave]);

  return null;
}
