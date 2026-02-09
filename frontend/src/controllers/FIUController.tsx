/** Base controller contract for load/refresh flows. */
export abstract class FIUController {
    abstract load(): Promise<void>
    abstract refresh(): Promise<void>
}
