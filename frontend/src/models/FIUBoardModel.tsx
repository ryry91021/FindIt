import { FIUModel } from './FIUModel'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'

export class FIUBoardModel extends FIUModel<FIUBoardEntity> {
    get id() {
        return this.entity.id
    }

    get displayName() {
        return this.entity.display_name
    }
}
