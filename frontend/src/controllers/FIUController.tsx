/** Base controller contract for load/refresh flows. */
export abstract class FIUController {
    /** Loads initial controller data. */
    abstract load(): Promise<void>

    /** Refreshes controller data after state-changing actions. */
    abstract refresh(): Promise<void>
}
