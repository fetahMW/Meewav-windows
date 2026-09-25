import { TREMPLIN_FEATURE_FLAGS } from "./tremplinFeatureFlags";

export type TremplinAnalyticsEvent =
  | "tremplin_home_viewed"
  | "artist_search_started"
  | "artist_search_result_selected"
  | "artist_path_opened"
  | "support_space_opened"
  | "token_status_explained"
  | "project_card_opened"
  | "grade_section_viewed"
  | "rules_opened"
  | "artist_onboarding_opened"
  | "ecosystem_link_opened"
  | "preview_started"
  | "preview_completed"
  | "artist_card_opened"
  | "artist_followed"
  | "artist_unfollowed"
  | "room_opened"
  | "project_step_opened"
  | "grade_explanation_opened"
  | "support_tab_opened"
  | "purchase_flow_started"
  | "purchase_summary_viewed"
  | "risk_acknowledged"
  | "purchase_confirmed"
  | "resale_flow_started"
  | "resale_confirmed"
  | "how_it_works_completed";

export type TremplinAnalyticsDetail = Readonly<Record<string, string | number | boolean | null>>;

export function trackTremplinEvent(
  eventName: TremplinAnalyticsEvent,
  detail: TremplinAnalyticsDetail = {},
) {
  if (!TREMPLIN_FEATURE_FLAGS.productAnalytics || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("meewav:tremplin-analytics", {
    detail: { eventName, ...detail },
  }));
}
