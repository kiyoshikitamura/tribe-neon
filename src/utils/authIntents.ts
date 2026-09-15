export const EMAIL_ONBOARDING_INTENT_KEY = "tribe_onboarding_email_intent";
export const EMAIL_ONBOARDING_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type EmailOnboardingIntent = {
  method: "EMAIL";
  userId: string;
  email: string;
  startedAt: number;
};

export function readEmailOnboardingIntent(): EmailOnboardingIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(EMAIL_ONBOARDING_INTENT_KEY) || "null") as EmailOnboardingIntent | null;
    const age = Date.now() - (value?.startedAt || 0);
    return value?.method === "EMAIL"
      && typeof value.userId === "string"
      && typeof value.email === "string"
      && age >= 0
      && age <= EMAIL_ONBOARDING_INTENT_MAX_AGE_MS
      ? value
      : null;
  } catch {
    return null;
  }
}
