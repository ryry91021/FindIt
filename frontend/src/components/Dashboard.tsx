import { FIUMapController } from '../controllers/FIUMapController'

interface DashboardProps {
  userEmail: string | undefined
  userId: string | undefined
  userDisplayName?: string
  onLogout: () => void
}

/** Top-level dashboard component that delegates to FIUBoardView. */
export function Dashboard({ userEmail, userId, userDisplayName, onLogout }: DashboardProps) {
  return (
    <FIUMapController
      userEmail={userEmail}
      userId={userId}
      userDisplayName={userDisplayName}
      onLogout={onLogout}
    />
  )
}
