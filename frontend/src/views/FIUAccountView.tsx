import { useState } from 'react'

type Props = {
    userEmail?: string
    onSignOut: () => void
}

export function FIUAccountView({ userEmail, onSignOut }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <div className="account-menu">
            <button className="account-button" onClick={() => setOpen((v) => !v)}>
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
