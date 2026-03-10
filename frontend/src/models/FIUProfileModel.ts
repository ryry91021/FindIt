import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'

type ProfileRow = {
    id?: string | null
    user_id?: string | null
    full_name?: string | null
    display_name?: string | null
    username?: string | null
    email?: string | null
}

function toBestLabel(row: ProfileRow): string | undefined {
    const label =
        row.display_name?.trim() ||
        row.full_name?.trim() ||
        row.username?.trim() ||
        row.email?.trim()

    return label && label.length > 0 ? label : undefined
}

async function fetchProfilesByColumn(
    client: SupabaseClient,
    userIds: string[],
    idColumn: 'id' | 'user_id'
): Promise<{ rows: ProfileRow[]; error: unknown | null }> {
    // Keep this select minimal so it works even if your profiles table only has
    // (id/user_id, display_name) and not the other optional columns.
    const selectCols = `${idColumn}, display_name`

    // Supabase client types can get extremely deep when columns are dynamic.
    // Cast the query builder to keep TS from exploding.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = client.from('profiles')

    const { data, error } = await query.select(selectCols).in(idColumn, userIds)

    return { rows: (data ?? []) as ProfileRow[], error }
}

export class FIUProfileModel {
    /**
     * Sets the display name for a user in the profiles table.
     * Uses an upsert so the row will be created if missing.
     */
    static async setDisplayNameForUser(
        userId: string,
        displayName: string,
        client: SupabaseClient = supabase
    ): Promise<void> {
        const next = displayName.trim()
        if (!userId || userId.trim().length === 0) {
            throw new Error('Missing user id.')
        }
        if (!next) {
            throw new Error('Display name cannot be empty.')
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query: any = client.from('profiles')

        const first = await query.upsert(
            { id: userId, display_name: next },
            { onConflict: 'id' }
        )
        if (!first.error) return

        const second = await query.upsert(
            { user_id: userId, display_name: next },
            { onConflict: 'user_id' }
        )
        if (second.error) {
            console.warn('FIUProfileModel.setDisplayNameForUser: upsert failed', first.error, second.error)
            throw new Error('Unable to update display name.')
        }
    }

    /**
     * Ensures a profile row exists for the authenticated user.
     * This runs client-side post-login, so it satisfies the RLS checks (id = auth.uid()).
     */
    static async ensureProfileForUser(
        input: {
            id: string
            email?: string | null
            user_metadata?: Record<string, unknown> | null
        } | null,
        client: SupabaseClient = supabase
    ): Promise<void> {
        if (!input?.id) return

        const metadataDisplayName =
            typeof input.user_metadata?.display_name === 'string'
                ? input.user_metadata.display_name
                : undefined

        const fallbackFromEmail = (input.email ?? '').split('@')[0] || undefined
        const desiredDisplayName = (metadataDisplayName || fallbackFromEmail)?.trim()
        if (!desiredDisplayName) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query: any = client.from('profiles')

        // Try the common schema first: profiles.id == auth.users.id
        const first = await query.select('display_name').eq('id', input.id).maybeSingle()
        if (!first.error) {
            const existing = (first.data?.display_name as string | null | undefined)?.trim()
            if (existing) return

            const { error: upsertErr } = await query.upsert(
                { id: input.id, display_name: desiredDisplayName },
                { onConflict: 'id' }
            )
            if (upsertErr) {
                console.warn('FIUProfileModel.ensureProfileForUser: upsert failed', upsertErr)
            }
            return
        }

        // Fallback schema: profiles.user_id == auth.users.id
        const second = await query.select('display_name').eq('user_id', input.id).maybeSingle()
        if (second.error) {
            console.warn('FIUProfileModel.ensureProfileForUser: select failed', first.error)
            return
        }

        const existing = (second.data?.display_name as string | null | undefined)?.trim()
        if (existing) return

        const { error: upsertErr } = await query.upsert(
            { user_id: input.id, display_name: desiredDisplayName },
            { onConflict: 'user_id' }
        )

        if (upsertErr) {
            console.warn('FIUProfileModel.ensureProfileForUser: upsert failed', upsertErr)
        }
    }

    /**
     * Fetches a best-effort display label for a single user.
     * Prefers `display_name`, then `full_name`, `username`, `email`.
     */
    static async fetchBestLabelForUser(
        userId?: string,
        fallbackEmail?: string,
        client: SupabaseClient = supabase
    ): Promise<string | undefined> {
        if (!userId) return fallbackEmail

        const labels = await this.fetchLabelsForUsers([userId], client)
        return labels.get(userId) ?? fallbackEmail
    }

    /**
     * Fetches best-effort display labels for multiple users.
     * Handles both common profile schemas: `profiles.id` or `profiles.user_id`.
     */
    static async fetchLabelsForUsers(
        userIds: string[],
        client: SupabaseClient = supabase
    ): Promise<Map<string, string>> {
        const uniqueUserIds = Array.from(
            new Set(userIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
        )

        const labelByUserId = new Map<string, string>()
        if (uniqueUserIds.length === 0) return labelByUserId

        const requested = new Set(uniqueUserIds)

        const applyRows = (rows: ProfileRow[]) => {
            rows.forEach((row) => {
                const label = toBestLabel(row)
                if (!label) return

                // Map by whichever identifier matches the requested user ids.
                if (row.id && requested.has(row.id)) {
                    labelByUserId.set(row.id, label)
                }
                if (row.user_id && requested.has(row.user_id)) {
                    labelByUserId.set(row.user_id, label)
                }
            })
        }

        // Try both common schemas; avoid failing the whole lookup if one shape doesn't exist.
        const firstAttempt = await fetchProfilesByColumn(client, uniqueUserIds, 'id')
        if (!firstAttempt.error) applyRows(firstAttempt.rows)

        const secondAttempt = await fetchProfilesByColumn(client, uniqueUserIds, 'user_id')
        if (!secondAttempt.error) applyRows(secondAttempt.rows)

        return labelByUserId
    }
}
