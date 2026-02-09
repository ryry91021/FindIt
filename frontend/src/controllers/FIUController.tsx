export abstract class FIUController {
    abstract load(): Promise<void>
    abstract refresh(): Promise<void>
}
