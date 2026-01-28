import { FIUBoardView } from '../views/FIUBoardView'

interface DashboardProps {
  userEmail: string | undefined
  onLogout: () => void
}

export function Dashboard({ userEmail, onLogout }: DashboardProps) {
  return <FIUBoardView userEmail={userEmail} onLogout={onLogout} />
}
