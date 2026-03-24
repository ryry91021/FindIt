/*
    Responsibilities:
        - Provides generic wrapper for entities
        - Provides getter for entities
        - getEntity()
*/


import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'


/** Generic model wrapper that exposes a typed entity. */
export abstract class FIUModel<T> {
    protected entity: T

    constructor(entity: T) {
        this.entity = entity
    }

    /** Returns the underlying entity for this model. */
    getEntity(): T {
        return this.entity
    }

    protected static isDev(): boolean {
        return import.meta.env.MODE === 'development'
    }

    protected static formatSupabaseError(error: unknown): string {
        if (!error) return ''
        if (error instanceof Error) return error.message

        if (typeof error === 'object') {
            const e = error as {
                message?: unknown
                details?: unknown
                hint?: unknown
                code?: unknown
            }

            const parts = [e.message, e.details, e.hint, e.code]
                .filter((v) => v !== undefined && v !== null)
                .map((v) => String(v))

            if (parts.length > 0) return parts.join(' | ')

            try {
                return JSON.stringify(error)
            } catch {
                return String(error)
            }
        }

        return String(error)
    }

    protected static async resolveUserId(
        userId?: string,
        client: SupabaseClient = supabase
    ): Promise<string | undefined> {
        // Always hydrate the auth session for the shared client to ensure RLS-protected
        // queries carry the JWT. Without this, some queries can return 0 rows silently
        // early in app startup even when a userId prop is already known.
        if (client === supabase) {
            const { error } = await client.auth.getSession()
            if (error) {
                console.error('FIUModel.resolveUserId: auth.getSession failed', error)
                // If the caller already provided a userId, don't block the request flow.
                // (The server may still reject queries depending on auth/RLS.)
                if (!userId) throw new Error('Unable to resolve user identity.')
            }
        }

        if (userId) return userId

        const { data, error } = await client.auth.getSession()
        if (error) {
            console.error('FIUModel.resolveUserId: auth.getSession failed', error)
            throw new Error('Unable to resolve user identity.')
        }

        return data.session?.user?.id
    }
}
