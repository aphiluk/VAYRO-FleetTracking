-- Align existing Auth/User databases with PDF Data Dictionary pages 7 and 16.
-- Safe to repeat. Never truncate values or remove rows to make the migration pass.
BEGIN;
LOCK TABLE public.company, public.users, public.system_log IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.company WHERE char_length(contact_name) > 100) THEN
    RAISE EXCEPTION 'Migration stopped: company.contact_name exceeds 100 characters. Resolve those rows explicitly; no data was truncated.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.system_log WHERE char_length(entity_id) > 80) THEN
    RAISE EXCEPTION 'Migration stopped: system_log.entity_id exceeds 80 characters. Resolve those rows explicitly; no data was truncated.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.system_log l LEFT JOIN public.company c ON c.company_id=l.company_id
             WHERE l.company_id IS NOT NULL AND c.company_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.system_log l LEFT JOIN public.users u ON u.user_id=l.user_id
                WHERE l.user_id IS NOT NULL AND u.user_id IS NULL) THEN
    RAISE EXCEPTION 'Migration stopped: audit rows reference missing company/users. Resolve orphan references explicitly; no data was removed.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_log' AND column_name='log_id') THEN
    ALTER TABLE public.system_log RENAME COLUMN log_id TO system_log_id;
  END IF;
END $$;

ALTER TABLE public.company ALTER COLUMN contact_name TYPE VARCHAR(100);
ALTER TABLE public.system_log
  ALTER COLUMN action TYPE VARCHAR(120),
  ALTER COLUMN entity_type TYPE VARCHAR(80),
  ALTER COLUMN entity_id TYPE VARCHAR(80);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.system_log'::regclass AND conname='system_log_company_id_fkey') THEN
    ALTER TABLE public.system_log ADD CONSTRAINT system_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(company_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.system_log'::regclass AND conname='system_log_user_id_fkey') THEN
    ALTER TABLE public.system_log ADD CONSTRAINT system_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);
  END IF;
END $$;
COMMIT;
