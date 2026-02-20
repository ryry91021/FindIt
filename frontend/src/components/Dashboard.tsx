import { FIUBoardController } from '../controllers/FIUBoardController'

interface DashboardProps {
  userEmail: string | undefined
  userId: string | undefined
  onLogout: () => void
}

/** Top-level dashboard component that delegates to FIUBoardView. */
export function Dashboard({ userEmail, userId, onLogout }: DashboardProps) {
  return <FIUBoardController userEmail={userEmail} userId={userId} onLogout={onLogout} />
}
