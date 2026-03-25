import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'

type ProfileRow = {
    id?: string | null
    display_name?: string | null
    full_name?: string | null
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

export class FIUProfileModel {
    /**
     * Sets the display name for a user in the profiles table.
     * Schema: profiles.id references auth.users.id.
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

        const { error } = await query.upsert(
            { id: userId, display_name: next },
            { onConflict: 'id' }
        )

        if (error) {
            console.warn('FIUProfileModel.setDisplayNameForUser: upsert failed', error)
            throw new Error('Unable to update display name.')
        }
    }

    /**
     * Ensures a profile row exists for the authenticated user.
     * Best-effort: does not throw if blocked by policy.
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

        const first = await query.select('display_name').eq('id', input.id).maybeSingle()
        if (first.error) {
            console.warn('FIUProfileModel.ensureProfileForUser: select failed', first.error)
            return
        }

        const existing = (first.data?.display_name as string | null | undefined)?.trim()
        if (existing) return

        const { error: upsertErr } = await query.upsert(
            { id: input.id, display_name: desiredDisplayName },
            { onConflict: 'id' }
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
     * Schema: profiles.id matches auth.users.id.
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query: any = client.from('profiles')

        const { data, error } = await query
            .select('id, display_name')
            .in('id', uniqueUserIds)

        if (error) {
            // If RLS blocks this, we just fall back to ids.
            console.warn('FIUProfileModel.fetchLabelsForUsers: query failed', error)
            return labelByUserId
        }

        ;((data ?? []) as ProfileRow[]).forEach((row) => {
            if (!row.id) return
            const label = toBestLabel(row)
            if (!label) return
            labelByUserId.set(row.id, label)
        })

        return labelByUserId
    }
}
