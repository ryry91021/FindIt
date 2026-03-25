import { useEffect, useState } from 'react'
import { Login } from './components/Login'
import { Signup } from './components/Signup'
import { Dashboard } from './components/Dashboard'
import { supabase } from './services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import { FIUProfileModel } from './models/FIUProfileModel'
import './App.css'

type AuthPage = 'login' | 'signup'

function App() {
  const [currentPage, setCurrentPage] = useState<AuthPage>('login')
  const [user, setUser] = useState<User | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) =>
          setTimeout(() => reject(new Error('Timed out while initializing auth session')), ms)
        ),
      ])
    }

    const init = async () => {
      try {
        const { data, error } = await withTimeout(supabase.auth.getSession(), 4000)
        if (!mounted) return
        if (error) {
          console.error('Error reading session:', error)
          setUser(null)
        } else {
          setUser(data.session?.user ?? null)
        }
      } catch (e) {
        if (!mounted) return
        console.error('Auth init failed:', e)
        setUser(null)
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

  useEffect(() => {
    let mounted = true

    const loadDisplayName = async (userId: string, fallbackEmail?: string) => {
      try {
        const displayName = await FIUProfileModel.fetchBestLabelForUser(
          userId,
          fallbackEmail,
          supabase
        )

        if (!mounted) return
        setUserDisplayName(displayName)
      } catch (e) {
        if (!mounted) return
        console.warn('Unable to load profile display name (unexpected):', e)
        setUserDisplayName(undefined)
      }
    }

    const currentUser = user

    if (!currentUser?.id) {
      setUserDisplayName(undefined)
      return () => {
        mounted = false
      }
    }

    // Best-effort: ensure a profile exists (harmless if already present).
    void FIUProfileModel.ensureProfileForUser(currentUser, supabase)
    void loadDisplayName(currentUser.id, currentUser.email ?? undefined)

    return () => {
      mounted = false
    }
  }, [user])

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (user) {
    return (
      <Dashboard
        userEmail={user.email}
        userId={user.id}
        userDisplayName={userDisplayName}
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
