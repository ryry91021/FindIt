import { FIUBoardView } from '../views/FIUBoardView'

interface DashboardProps {
  userEmail: string | undefined
  userId: string | undefined
  onLogout: () => void
}

export function Dashboard({ userEmail, userId, onLogout }: DashboardProps) {
  return <FIUBoardView userEmail={userEmail} userId={userId} onLogout={onLogout} />
}
