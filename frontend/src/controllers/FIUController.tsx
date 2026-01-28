export interface FIUController {
    load(): Promise<void>
    refresh(): Promise<void>
}
