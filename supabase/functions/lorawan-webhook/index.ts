// Supabase Edge Function: lorawan-webhook
// Accepts normalized location events and writes to location_logs.

import { createClient } from 'npm:@supabase/supabase-js@2'

type NormalizedLocationEvent = {
    device_eui: string
    recorded_at: string
    latitude: number
    longitude: number
    accuracy_meters?: number | null
    source?: string
    run_id?: string
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers)
    headers.set('content-type', 'application/json; charset=utf-8')
    return new Response(JSON.stringify(body), { ...init, headers })
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

Deno.serve(async (req) => {
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET')
    if (expectedSecret) {
        const auth = req.headers.get('authorization') ?? ''
        const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
        if (!token || token !== expectedSecret) {
            return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
        }
    }

    // Note: Supabase CLI treats env var names starting with SUPABASE_ as reserved
    // and may refuse to set them via `supabase secrets set`. So we support a
    // non-reserved secret name for the service role key.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
        return jsonResponse(
            {
                error: 'Server misconfigured: missing SUPABASE_URL or SERVICE_ROLE_KEY',
            },
            { status: 500 }
        )
    }

    const client = createClient(supabaseUrl, serviceRoleKey)

    if (req.method === 'DELETE') {
        let body: { run_id?: string }
        try {
            body = (await req.json()) as { run_id?: string }
        } catch {
            return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
        }

        const runId = typeof body.run_id === 'string' ? body.run_id.trim() : ''
        if (!runId) {
            return jsonResponse({ error: 'Missing run_id' }, { status: 400 })
        }

        const { error: delErr, count } = await client
            .from('location_logs')
            .delete({ count: 'exact' })
            .eq('raw_payload->>run_id', runId)
            .or('raw_payload->>source.eq.replay,raw_payload->>source.eq.integration-test')

        if (delErr) {
            return jsonResponse({ error: 'Cleanup failed', details: delErr.message }, { status: 500 })
        }

        return jsonResponse({ ok: true, deleted: count ?? 0 })
    }

    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
    }

    let body: NormalizedLocationEvent
    try {
        body = (await req.json()) as NormalizedLocationEvent
    } catch {
        return jsonResponse({ error: 'Invalid JSON' }, { status: 400 })
    }

    const deviceEui = typeof body.device_eui === 'string' ? body.device_eui.trim() : ''
    const recordedAt = typeof body.recorded_at === 'string' ? body.recorded_at.trim() : ''

    if (!deviceEui) {
        return jsonResponse({ error: 'Missing device_eui' }, { status: 400 })
    }

    if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
        return jsonResponse({ error: 'Missing or invalid recorded_at (ISO timestamp expected)' }, { status: 400 })
    }

    if (!isFiniteNumber(body.latitude) || body.latitude < -90 || body.latitude > 90) {
        return jsonResponse({ error: 'Missing or invalid latitude' }, { status: 400 })
    }

    if (!isFiniteNumber(body.longitude) || body.longitude < -180 || body.longitude > 180) {
        return jsonResponse({ error: 'Missing or invalid longitude' }, { status: 400 })
    }

    const { data: deviceRow, error: deviceErr } = await client
        .from('devices')
        .select('id')
        .eq('device_eui', deviceEui)
        .maybeSingle()

    if (deviceErr) {
        return jsonResponse({ error: 'Device lookup failed', details: deviceErr.message }, { status: 500 })
    }

    if (!deviceRow?.id) {
        return jsonResponse({ error: 'Unknown device_eui' }, { status: 404 })
    }

    const accuracy = body.accuracy_meters == null ? null : body.accuracy_meters
    const runId = typeof body.run_id === 'string' ? body.run_id.trim() : ''

    const { error: insertErr } = await client.from('location_logs').insert({
        device_id: deviceRow.id,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy_meters: accuracy,
        recorded_at: recordedAt,
        raw_payload: { ...body, source: body.source ?? 'webhook', ...(runId ? { run_id: runId } : {}) },
    })

    if (insertErr) {
        return jsonResponse({ error: 'Insert failed', details: insertErr.message }, { status: 500 })
    }

    return jsonResponse({ ok: true })
})
