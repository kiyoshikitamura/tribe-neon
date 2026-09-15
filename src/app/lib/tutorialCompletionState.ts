type CompletionState = {
  user_id?: string;
  has_profile?: boolean;
  is_anonymous?: boolean;
  identity_integrity_valid?: boolean;
  tutorial_step?: string;
  authentication_pending?: boolean;
  gameplay_authorized?: boolean;
  auth_method?: string | null;
};

/** Display transition only. Google finalization and gameplay remain server-authorized. */
export function canLeaveTutorialRuleGuide(state: CompletionState | null, userId: string | undefined, anonymous: boolean): boolean {
  if (!state || !userId || state.user_id !== userId || state.has_profile !== true
    || state.identity_integrity_valid !== true || state.is_anonymous !== anonymous) return false;
  if (anonymous) return state.tutorial_step === "COMPLETE"
    && state.authentication_pending === true && state.gameplay_authorized === true;
  if (state.tutorial_step === "AUTHENTICATION") return state.gameplay_authorized === true;
  return state.tutorial_step === "COMPLETE" && (state.gameplay_authorized === true
    || (state.auth_method === "GOOGLE" && state.authentication_pending === false));
}
