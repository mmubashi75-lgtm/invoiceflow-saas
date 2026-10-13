-- Run this if you already applied the old schema
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

-- Optional: normalize expired trials overnight (or call from Edge Function)
-- UPDATE public.profiles
-- SET subscription_status = 'free', subscription_plan = 'free'
-- WHERE subscription_status = 'trialing' AND trial_ends_at < now();
