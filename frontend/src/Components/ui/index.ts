// src/Components/ui/index.ts
export { Spinner } from "./Spinner";
export { StatCard } from "./StatCard";
export { ImageUploader } from "./ImageUploader";
export { ConfirmModal } from "./ConfirmModal";
export { DeleteConfirmModal } from "./DeleteConfirmModal";
export { OrderCalendar, type CalendarItem } from "./OrderCalendar";
export { ReadOnlyBanner } from "./ReadOnlyBanner";
// Date maths lives in utils/dateRange so it stays testable without rendering.
export {
  EMPTY_RANGE,
  isWithinRange,
  isRangeActive,
  describeRange,
  type DateRange,
} from "../../utils/dateRange";
