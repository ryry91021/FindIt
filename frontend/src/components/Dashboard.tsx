import { FIUBoardController } from '../controllers/FIUBoardController'

interface DashboardProps {
  userEmail: string | undefined
  userId: string | undefined
  onLogout: () => void
}

export function Dashboard({ userEmail, userId, onLogout }: DashboardProps) {
  return <FIUBoardController userEmail={userEmail} userId={userId} onLogout={onLogout} />
}
