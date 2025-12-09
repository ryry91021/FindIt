import { authService } from '../services/authService'
import './Dashboard.css'

interface DashboardProps {
  userEmail: string | undefined
  onLogout: () => void
}

export function Dashboard({ userEmail, onLogout }: DashboardProps) {
  const handleLogout = async () => {
    try {
      await authService.signOut()
      onLogout()
    } catch (err) {
      console.error('Failed to logout:', err)
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <h1>Welcome!</h1>
        <p className="user-email">Logged in as: {userEmail}</p>
        <button onClick={handleLogout} className="logout-button">
          Sign Out
        </button>
      </div>
    </div>
  )
}
