// Pastel palette + deterministic hash so each station "group" (Line 1, Imu,
// Fish, Panner…) gets a stable color without anyone having to pick one —
// matching the color-coded row groupings staff already use on paper shift
// sheets. Shared between DailyOperationsHub and DailyStaffingPanel so an
// assignment's color stays the same in both views.
const ASSIGNMENT_GROUP_PALETTE = [
  { bg: "#fdeaea", border: "#f0b8b8", text: "#8b1d20" },
  { bg: "#fdf0e3", border: "#f0d0a0", text: "#9a5b0a" },
  { bg: "#eaf7ee", border: "#bfe3c8", text: "#15803d" },
  { bg: "#e7f0ff", border: "#bcd4fb", text: "#1d4ed8" },
  { bg: "#f1eafc", border: "#d9c6f5", text: "#6d28d9" },
  { bg: "#fff6dc", border: "#f0dca0", text: "#9a6812" },
  { bg: "#e6fbf8", border: "#a8e6df", text: "#0f766e" },
];

function hashStringToIndex(str, mod) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash % mod;
}

export function getAssignmentGroupColors(group) {
  if (!group || !group.trim()) return null;
  return ASSIGNMENT_GROUP_PALETTE[hashStringToIndex(group.trim().toLowerCase(), ASSIGNMENT_GROUP_PALETTE.length)];
}
