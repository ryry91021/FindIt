-- Adds an RLS-safe delete RPC for log runs.

CREATE OR REPLACE FUNCTION public.delete_log_records(
    p_run_id text,
    p_board_id uuid,
    p_day date DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count bigint := 0;
BEGIN
    IF p_board_id IS NULL THEN
        RAISE EXCEPTION 'p_board_id is required';
    END IF;

    IF p_day IS NOT NULL THEN
        DELETE FROM public.location_logs
        WHERE device_id = p_board_id
          AND recorded_at >= p_day::timestamptz
          AND recorded_at < (p_day::timestamptz + interval '1 day');
    ELSE
        DELETE FROM public.location_logs
        WHERE device_id = p_board_id
          AND run_id = p_run_id;
    END IF;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF p_day IS NULL AND p_run_id IS NOT NULL AND btrim(p_run_id) <> '' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.location_logs
            WHERE run_id = p_run_id
            LIMIT 1
        ) THEN
            DELETE FROM public.logs_metadata
            WHERE run_id = p_run_id;
        END IF;
    END IF;

    RETURN deleted_count;
END;
$$;
