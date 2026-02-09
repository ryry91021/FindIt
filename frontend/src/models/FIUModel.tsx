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
}
