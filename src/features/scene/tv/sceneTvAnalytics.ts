export type SceneTvAnalyticsEvent =
  | "tv_opened"
  | "tv_play_started"
  | "tv_unmuted"
  | "tv_program_viewed"
  | "tv_program_25"
  | "tv_program_50"
  | "tv_program_75"
  | "tv_program_completed"
  | "tv_next_program_viewed"
  | "tv_guide_opened"
  | "tv_reminder_created"
  | "tv_room_simulcast_opened"
  | "tv_scene_catchup_opened"
  | "tv_fullscreen"
  | "tv_pip"
  | "tv_error"
  | "tv_fallback_triggered";

export type SceneTvProgressEvent = Extract<
  SceneTvAnalyticsEvent,
  "tv_program_25" | "tv_program_50" | "tv_program_75"
>;

const SCENE_TV_PROGRESS_MILESTONES = [
  [25, "tv_program_25"],
  [50, "tv_program_50"],
  [75, "tv_program_75"],
] as const satisfies ReadonlyArray<readonly [number, SceneTvProgressEvent]>;

export function getSceneTvProgressEvents(progressPercent: number) {
  if (!Number.isFinite(progressPercent)) return [];
  const boundedProgress = Math.max(0, Math.min(100, progressPercent));
  return SCENE_TV_PROGRESS_MILESTONES
    .filter(([threshold]) => boundedProgress >= threshold)
    .map(([, event]) => event);
}

export type SceneTvAnalyticsDetail = {
  event: SceneTvAnalyticsEvent;
  channelId: "meewav-main";
  programId?: string;
  sourceId?: string;
  reason?: string;
};

export function trackSceneTv(detail: Omit<SceneTvAnalyticsDetail, "channelId">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SceneTvAnalyticsDetail>("meewav:analytics", {
    detail: {
      channelId: "meewav-main",
      ...detail,
    },
  }));
}
