export type LoginBonusCellState = "RECEIVED" | "TODAY" | "NEXT" | "FUTURE";

export function nextLoginBonusDay(currentStep: number, masterDays: readonly number[]) {
  const days = [...masterDays].sort((left, right) => left - right);
  if (days.length === 0) return currentStep;
  const currentIndex = days.indexOf(currentStep);
  return currentIndex < 0 || currentIndex === days.length - 1 ? days[0] : days[currentIndex + 1];
}

export function loginBonusCellState(
  day: number,
  currentStep: number,
  claimedToday: boolean,
  masterDays: readonly number[],
): LoginBonusCellState {
  const nextDay = nextLoginBonusDay(currentStep, masterDays);
  if (claimedToday && day === currentStep) return "TODAY";
  if (day === nextDay) return "NEXT";
  if (claimedToday && day < currentStep) return "RECEIVED";
  return "FUTURE";
}
