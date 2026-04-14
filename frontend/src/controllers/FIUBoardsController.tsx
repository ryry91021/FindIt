import { FIUBoardModel } from '../models/FIUBoardModel'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'

export interface FIUBoardsControllerPort {
    loadBoards(userId?: string): Promise<FIUBoardEntity[]>
    createBoard(displayName: string, deviceEui: string, userId?: string): Promise<void>
    deleteBoard(boardId: string): Promise<void>
    renameBoard(boardId: string, newName: string): Promise<void>
    assignBoardToGroup(boardId: string, groupId: string): Promise<void>
    setBoardsForGroup(groupId: string, selectedBoardIds: string[], boardsState: FIUBoardEntity[]): Promise<void>
}

/** Domain controller for Board operations (no UI, no cross-domain orchestration). */
export class FIUBoardsController implements FIUBoardsControllerPort {
    async loadBoards(userId?: string): Promise<FIUBoardEntity[]> {
        return await FIUBoardModel.fetchBoardsForUser(userId)
    }

    async createBoard(displayName: string, deviceEui: string, userId?: string): Promise<void> {
        await FIUBoardModel.createBoard(displayName, deviceEui, userId)
    }

    async deleteBoard(boardId: string): Promise<void> {
        await FIUBoardModel.deleteBoard(boardId)
    }

    async renameBoard(boardId: string, newName: string): Promise<void> {
        await FIUBoardModel.renameBoard(boardId, newName)
    }

    async assignBoardToGroup(boardId: string, groupId: string): Promise<void> {
        await FIUBoardModel.assignBoardToGroup(boardId, groupId)
    }

    async setBoardsForGroup(groupId: string, selectedBoardIds: string[], boardsState: FIUBoardEntity[]): Promise<void> {
        await FIUBoardModel.setBoardsForGroup(
            groupId,
            selectedBoardIds,
            boardsState.map((b) => b.id),
            boardsState.filter((b) => b.group_id === groupId).map((b) => b.id)
        )
    }
}
