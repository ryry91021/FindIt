import { useEffect, useState } from 'react'
import { Login } from './components/Login'
import { Signup } from './components/Signup'
import { Dashboard } from './components/Dashboard'
import { supabase } from './services/supabaseClient'
import './App.css'

type AuthPage = 'login' | 'signup'

function App() {
  const [currentPage, setCurrentPage] = useState<AuthPage>('login')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!mounted) return
        if (error) {
          console.error('Error reading session:', error)
          setUser(null)
        } else {
          setUser(data.session?.user ?? null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void init()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (user) {
    return (
      <Dashboard
        userEmail={user.email}
        userId={user.id}
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
            const { data } = await supabase.auth.getSession()
            setUser(data.session?.user ?? null)
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
