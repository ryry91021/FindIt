import { useState, useEffect } from 'react'
import { Login } from './components/Login'
import { Signup } from './components/Signup'
import { Dashboard } from './components/Dashboard'
import { authService } from './services/authService'
import './App.css'

type AuthPage = 'login' | 'signup'

function App() {
  const [currentPage, setCurrentPage] = useState<AuthPage>('login')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      try {
        const currentUser = await authService.getCurrentUser()
        setUser(currentUser)
      } catch (err) {
        console.error('Error checking auth status:', err)
      } finally {
        setLoading(false)
      }
    }

    checkUser()
  }, [])

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (user) {
    return (
      <Dashboard
        userEmail={user.email}
        onLogout={() => setUser(null)}
      />
    )
  }

  return (
    <>
      {currentPage === 'login' ? (
        <Login
          onSwitchToSignup={() => setCurrentPage('signup')}
          onLoginSuccess={async () => {
            const currentUser = await authService.getCurrentUser()
            setUser(currentUser)
          }}

        />
      ) : (
        <Signup
          onSwitchToLogin={() => setCurrentPage('login')}
          onSignupSuccess={() => setCurrentPage('login')}
        />
      )}
    </>
  )
}

export default App
