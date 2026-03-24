import { Component } from 'react'

/**
 * Base controller component for orchestration-level request flows.
 *
 * Provides:
 * - cancellation on unmount
 * - request sequencing to prevent stale async commits
 * - consistent unknown→message extraction for UI errors
 */
export class FIUController<Props, State> extends Component<Props, State> {
    private requestSeq = 0
    private cancelled = false

    protected beginRequest(): number {
        // In React dev/StrictMode, components may be mounted/unmounted/mounted to
        // surface side-effect bugs. If we set `cancelled=true` on an unmount, we
        // must allow subsequent mounts/requests to proceed.
        this.cancelled = false
        return ++this.requestSeq
    }

    protected isRequestActive(token: number): boolean {
        return !this.cancelled && this.requestSeq === token
    }

    protected getErrorMessage(err: unknown, fallback: string): string {
        return err instanceof Error ? err.message : fallback
    }

    componentWillUnmount(): void {
        this.cancelled = true
    }
}
