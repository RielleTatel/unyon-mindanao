import "server-only";

export { withEventFeature } from "./runtime";
export {
  createEventFeature,
  type EventCapabilities,
  type EventRepository,
} from "./events";
export type { EventRecord, EventSummary, EventUniversityChoice, EventLifecycleStatus } from "../contracts";
