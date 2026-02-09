import { Component } from 'react'

type Props = {
    userEmail?: string
    onSignOut: () => void
}

type State = {
    open: boolean
}

/** Small account dropdown widget (email + sign out). */
export class FIUAccountView extends Component<Props, State> {
    state: State = { open: false }

    /** Toggles the dropdown open/closed. */
    private toggleOpen = () => {
        this.setState((prev) => ({ open: !prev.open }))
    }

    /** Renders the account dropdown UI. */
    render() {
        const { userEmail, onSignOut } = this.props
        const { open } = this.state

        return (
            <div className="account-menu">
                <button className="account-button" onClick={this.toggleOpen}>
                    Account ⌄
                </button>

                {open && (
                    <div className="account-dropdown">
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
