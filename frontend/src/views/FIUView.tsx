import { Component } from 'react'

/**
 * Base view component for presentation-only UI.
 *
 * Centralizes tiny shared helpers to keep view classes consistent.
 */
export class FIUView<Props, State> extends Component<Props, State> {
    protected getErrorMessage(err: unknown, fallback: string): string {
        return err instanceof Error ? err.message : fallback
    }
}
