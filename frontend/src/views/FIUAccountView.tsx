import { Component } from 'react'

export type FIUAccountViewProps = {
    userEmail?: string
    userDisplayName?: string
    onSignOut: () => void
}

type State = {
    open: boolean
}

/** Small account dropdown widget (email + sign out). */
export class FIUAccountView extends Component<FIUAccountViewProps, State> {
    state: State = { open: false }

    /** Toggles the dropdown open/closed. */
    private toggleOpen = () => {
        this.setState((prev) => ({ open: !prev.open }))
    }

    /** Renders the account dropdown UI. */
    render() {
        const { userEmail, userDisplayName, onSignOut } = this.props
        const { open } = this.state

        const displayName = userDisplayName?.trim() || 'Not set'

        return (
            <div className="account-menu">
                <button className="account-button" onClick={this.toggleOpen}>
                    Account ⌄
                </button>

                {open && (
                    <div className="account-dropdown">
                        <p className="account-email">Display name: {displayName}</p>
                        <p className="account-email">{userEmail}</p>
                        <button className="signout-button" onClick={onSignOut}>
                            Sign Out
                        </button>
                    </div>
                )}
            </div>
        )
    }
}
