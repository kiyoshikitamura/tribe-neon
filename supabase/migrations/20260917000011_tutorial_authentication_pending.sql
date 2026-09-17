-- Production/Preview schema reconciliation required by defer_tutorial_authentication().
ALTER TABLE public.tutorial_progress
  ADD COLUMN IF NOT EXISTS authentication_pending boolean NOT NULL DEFAULT false;
