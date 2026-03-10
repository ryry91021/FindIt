import { Component } from 'react'
import { Modal } from '../components/Modal'
import { FIUProfileModel } from '../models/FIUProfileModel'

type Props = {
    userId?: string
    userEmail?: string
    userDisplayName?: string
    onDisplayNameUpdated?: (nextDisplayName: string) => void
    onSignOut: () => void
}

type State = {
    open: boolean
    editOpen: boolean
    editValue: string
    busy: boolean
    error: string | null
}

/** Small account dropdown widget (email + sign out). */
export class FIUAccountView extends Component<Props, State> {
    state: State = { open: false, editOpen: false, editValue: '', busy: false, error: null }

    /** Toggles the dropdown open/closed. */
    private toggleOpen = () => {
        this.setState((prev) => ({ open: !prev.open }))
    }

    private openEdit = () => {
        this.setState({
            editOpen: true,
            editValue: this.props.userDisplayName ?? '',
            busy: false,
            error: null,
        })
    }

    private closeEdit = () => {
        this.setState({ editOpen: false, editValue: '', busy: false, error: null })
    }

    private handleSubmitEdit = async (): Promise<void> => {
        const next = this.state.editValue.trim()
        if (!this.props.userId) {
            this.setState({ error: 'Missing user id.' })
            return
        }

        this.setState({ busy: true, error: null })
        try {
            await FIUProfileModel.setDisplayNameForUser(this.props.userId, next)
            this.props.onDisplayNameUpdated?.(next)
            this.closeEdit()
        } catch (err) {
            this.setState({ error: err instanceof Error ? err.message : 'Unable to update display name.' })
        } finally {
            this.setState({ busy: false })
        }
    }

    /** Renders the account dropdown UI. */
    render() {
        const { userEmail, userDisplayName, onSignOut } = this.props
        const { open, editOpen, editValue, busy, error } = this.state
        const display = userDisplayName?.trim() || 'Not set'

        return (
            <div className="account-menu">
                <button className="account-button" onClick={this.toggleOpen}>
                    Account ⌄
                </button>

                {open && (
                    <div className="account-dropdown">
                        <div className="account-display-name-row">
                            <p className="account-display-name">Display name: {display}</p>
                            <button
                                type="button"
                                className="account-edit-button"
                                onClick={this.openEdit}
                            >
                                Edit
                            </button>
                        </div>
                        {userEmail?.trim() && <p className="account-email">{userEmail}</p>}
                        <button className="signout-button" onClick={onSignOut}>
                            Sign Out
                        </button>
                    </div>
                )}

                <Modal
                    open={editOpen}
                    onRequestClose={this.closeEdit}
                    overlayClassName="account-edit-overlay"
                    contentClassName="account-edit-popup"
                    contentProps={{ 'aria-label': 'Edit display name' }}
                >
                    <h3>Edit display name</h3>
                    <input
                        className="board-management-input board-edit-compact"
                        value={editValue}
                        onChange={(e) => this.setState({ editValue: e.target.value })}
                        placeholder="Enter a display name"
                        autoFocus
                    />
                    {error && <p className="board-management-error">{error}</p>}
                    <div className="board-edit-popup-actions">
                        <button
                            type="button"
                            className="board-management-button"
                            onClick={this.closeEdit}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="board-management-button"
                            onClick={() => void this.handleSubmitEdit()}
                            disabled={busy || !editValue.trim()}
                        >
                            Save
                        </button>
                    </div>
                </Modal>
            </div>
        )
    }
}
