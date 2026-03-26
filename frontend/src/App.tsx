import { useEffect, useState } from 'react'
import { Login } from './components/Login'
import { Signup } from './components/Signup'
import { Dashboard } from './components/Dashboard'
import { supabase } from './services/supabaseClient'
import type { User } from '@supabase/supabase-js'
import { FIUProfileModel } from './models/FIUProfileModel'
import './App.css'

type AuthPage = 'landing' | 'login' | 'signup'

function App() {
  const [currentPage, setCurrentPage] = useState<AuthPage>('landing')
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

  if (currentPage === 'landing') {
    return (
      <div className="landing-page">
        <header className="landing-header">
          <div className="landing-logo">FindIt</div>
          <div className="landing-actions">
            <button onClick={() => setCurrentPage('login')} className="link-button">
              Sign in
            </button>
            <button onClick={() => setCurrentPage('signup')} className="primary-button">
              Sign up
            </button>
          </div>
        </header>

        <main className="landing-hero">
          <h1>Welcome to FindIt</h1>
          <p>
            Track, protect, and manage your assets seamlessly with real-time location insights and group sharing.
          </p>
          <div className="hero-cta">
            <button
              onClick={() => setCurrentPage('signup')}
              className="primary-button"
            >
              Get Started
            </button>
            <button
              onClick={() => setCurrentPage('login')}
              className="secondary-button"
            >
              I already have an account
            </button>
          </div>
        </main>

        <section className="landing-section about-section">
          <h2>About aWhere</h2>
          <p>
            aWhere is a location-tracking and data communication system combining LoRaWAN-enabled embedded hardware with a cloud-based application. 
            We enable reliable long-range data transfer, real-time asset visibility, and collaborative management via a web interface.
          </p>
          <h3>Mission</h3>
          <p>
            Design, implement, and validate an end-to-end distributed system that makes monitoring and managing connected devices simple, robust, and extensible.
          </p>
          <h3>Success Criteria</h3>
          <ul>
            <li>Reliable LoRaWAN communication between embedded boards and backend.</li>
            <li>Safe storage, processing, and display of location data in the frontend.</li>
            <li>Acceptance with Wearable Robotics Systems Lab benchmarks.</li>
          </ul>
        </section>

        <section className="landing-section team-section">
          <h2>Meet the Team</h2>
          <div className="team-grid">
            <article>
              <h4>Ryan Davis</h4>
              <p>Development lead, backend engineer, user advocate, system admin.</p>
            </article>
            <article>
              <h4>Cory Vitanza</h4>
              <p>Frontend architect, test lead, designer, integration engineer.</p>
            </article>
            <article>
              <h4>Roy Tas</h4>
              <p>Buildmeister, infrastructure engineer, risk manager, requirements owner.</p>
            </article>
          </div>
        </section>

        <section className="landing-section process-section">
          <h2>Development Plan Highlights</h2>
          <p>
            Project phases include architecture, prototype communication, integration, system testing, and final delivery with CI/CD and documentation. 
            We follow an Agile Kanban workflow with frequent heartbeat, status, and issue meetings.
          </p>
        </section>

        <footer className="landing-footer">
          <p>Built for fast and reliable location discovery.</p>
        </footer>
      </div>
    )
  }

  return (
    <>
      {currentPage === 'login' ? (
        <>
          <div className="landing-subnav">
            <button onClick={() => setCurrentPage('landing')} className="link-button">
              ← Back to home
            </button>
          </div>
          <Login
            onSwitchToSignup={() => setCurrentPage('signup')}
            onLoginSuccess={async () => {
              const { data } = await supabase.auth.getSession()
              setUser(data.session?.user ?? null)
            }}
          />
        </>
      ) : (
        <>
          <div className="landing-subnav">
            <button onClick={() => setCurrentPage('landing')} className="link-button">
              ← Back to home
            </button>
          </div>
          <Signup
            onSwitchToLogin={() => setCurrentPage('login')}
            onSignupSuccess={() => setCurrentPage('login')}
          />
        </>
      )}
    </>
  )
}

export default App
