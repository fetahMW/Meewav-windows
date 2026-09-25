import type { MediaRightsGrant, MediaRightsIssueCode } from "../mediaGovernance";
import type {
  SceneTvChannelId,
  SceneTvGuide,
  SceneTvProgramFormat,
} from "./sceneTvGuide.models";

export type SceneTvAvailabilityIssueCode =
  | "channel-missing"
  | "invalid-window"
  | "minimum-days-not-met"
  | "fallback-config-invalid"
  | "fallback-source-missing"
  | "fallback-tv-rights-denied"
  | "editorial-day-empty"
  | "program-source-missing"
  | "program-invalid"
  | "broadcast-gap"
  | "broadcast-overlap"
  | "program-tv-rights-denied"
  | "insufficient-format-diversity";

export type SceneTvAvailabilityIssue = {
  code: SceneTvAvailabilityIssueCode;
  day?: string;
  programId?: string;
  sourceId?: string;
  detailCode?: MediaRightsIssueCode;
};

export type SceneTvAvailabilityGateOptions = {
  channelId: SceneTvChannelId;
  startDay: Date | string | number;
  days: number;
  territory: string;
  /** Cannot lower the product floor below seven consecutive local days. */
  minimumDays?: number;
  minimumDistinctFormats?: number;
};

export type SceneTvAvailabilityGateInput = {
  guide: SceneTvGuide;
  rightsGrants: readonly MediaRightsGrant[];
  options: SceneTvAvailabilityGateOptions;
};

export type SceneTvAvailabilityDecision = {
  available: boolean;
  channelId: SceneTvChannelId;
  startDay: string | null;
  endDayExclusive: string | null;
  evaluatedDays: number;
  editorialProgramCount: number;
  fallbackBlockCount: number;
  checkedSourceCount: number;
  distinctFormats: readonly SceneTvProgramFormat[];
  issues: readonly SceneTvAvailabilityIssue[];
};
