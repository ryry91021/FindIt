export abstract class FIUModel<T> {
    protected entity: T

    constructor(entity: T) {
        this.entity = entity
    }

    getEntity(): T {
        return this.entity
    }
}
