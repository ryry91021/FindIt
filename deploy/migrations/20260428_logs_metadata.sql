-- Log playback support: run grouping, rename metadata, group-filtered run fetching.

ALTER TABLE public.location_logs
    ADD COLUMN IF NOT EXISTS run_id text GENERATED ALWAYS AS (raw_payload ->> 'run_id') STORED;

CREATE INDEX IF NOT EXISTS idx_location_logs_run_id ON public.location_logs (run_id);

CREATE TABLE IF NOT EXISTS public.logs_metadata (
    run_id text PRIMARY KEY,
    name text,
    board_id uuid REFERENCES public.devices(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    archived boolean NOT NULL DEFAULT false,
    record_count bigint NOT NULL DEFAULT 0,
    start_at timestamptz,
    end_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_logs_metadata_board_id ON public.logs_metadata (board_id);

CREATE OR REPLACE FUNCTION public.logs_metadata_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.run_id IS NULL OR NEW.run_id = '' THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.logs_metadata (run_id, board_id, start_at, end_at, record_count)
    VALUES (NEW.run_id, NEW.device_id, NEW.recorded_at, NEW.recorded_at, 1)
    ON CONFLICT (run_id) DO UPDATE
    SET
        board_id = COALESCE(public.logs_metadata.board_id, EXCLUDED.board_id),
        start_at = LEAST(COALESCE(public.logs_metadata.start_at, EXCLUDED.start_at), EXCLUDED.start_at),
        end_at = GREATEST(COALESCE(public.logs_metadata.end_at, EXCLUDED.end_at), EXCLUDED.end_at),
        record_count = public.logs_metadata.record_count + 1;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logs_metadata_upsert ON public.location_logs;

CREATE TRIGGER trg_logs_metadata_upsert
AFTER INSERT ON public.location_logs
FOR EACH ROW
EXECUTE FUNCTION public.logs_metadata_upsert();

CREATE OR REPLACE FUNCTION public.fetch_runs_for_group(p_group_id uuid)
RETURNS TABLE (
    run_id text,
    name text,
    board_id uuid,
    start_at timestamptz,
    end_at timestamptz,
    record_count bigint,
    archived boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        lm.run_id,
        COALESCE(lm.name, d.display_name, lm.run_id) AS name,
        lm.board_id,
        lm.start_at,
        lm.end_at,
        lm.record_count,
        lm.archived
    FROM public.logs_metadata lm
    JOIN public.devices d ON d.id = lm.board_id
    WHERE d.group_id = p_group_id
      AND lm.archived = false
    ORDER BY lm.end_at DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.fetch_records_for_run(p_run_id text)
RETURNS TABLE (
    id bigint,
    device_id uuid,
    latitude double precision,
    longitude double precision,
    accuracy_meters double precision,
    recorded_at timestamptz,
    raw_payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        ll.id,
        ll.device_id,
        ll.latitude,
        ll.longitude,
        ll.accuracy_meters,
        ll.recorded_at,
        ll.raw_payload
    FROM public.location_logs ll
    WHERE ll.run_id = p_run_id
    ORDER BY ll.recorded_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.rename_run(p_run_id text, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_run_id IS NULL OR trim(p_run_id) = '' THEN
        RETURN;
    END IF;

    INSERT INTO public.logs_metadata (run_id, name)
    VALUES (trim(p_run_id), NULLIF(trim(p_name), ''))
    ON CONFLICT (run_id) DO UPDATE
    SET name = NULLIF(trim(p_name), '');
END;
$$;
