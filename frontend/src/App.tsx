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
          <div className='logo'>
            <img src="/aWhereLogo.png" alt="aWhere" className="landing-logo" />
          </div>  
          <div className="landing-actions">
            <button onClick={() => setCurrentPage('login')} className="link-button">Log in</button>
            <button onClick={() => setCurrentPage('signup')} className="primary-button">Sign up</button>
          </div>
        </header>

        <main className="landing-hero">
          <div className="landing-badge">Real-time location tracking</div>
          <h1 className="landing-title">
            <span className="landing-title__brand">aWhere</span>
            <span className="landing-title__tagline">Tracking made simple.</span>
          </h1>
          <p>
            See your devices on a map, set safe zones, and share access with the people you trust—so you always know where your loved ones are.
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
          <h2>What aWhere Does</h2>
          <p>
            aWhere helps you keep track of connected devices you own or share with a group.
            Open the app to view the latest location, check recent updates, and manage your devices in one place.
          </p>
          <h3>Who It's For</h3>
          <p>
            Families, students, and small teams who want a clear, reliable way to locate people or equipment—without digging through technical details.
          </p>
          <h3>Key Capabilities</h3>
          <ul>
            <li>View live and last-known device locations on an interactive map.</li>
            <li>Create safe zones (geofences) to help you spot unexpected movement.</li>
            <li>Share access with a group so everyone stays in sync.</li>
            <li>Organize devices with names and status details for quick recognition.</li>
          </ul>
        </section>

        <section className="landing-section team-section">
          <h2>Why People Use aWhere</h2>
          <div className="team-grid">
            <article>
              <h4>Peace of Mind</h4>
              <p>Quickly check where a device is and when it last reported in.</p>
            </article>
            <article>
              <h4>Stay Organized</h4>
              <p>Manage multiple devices, keep them labeled, and find what you need fast.</p>
            </article>
            <article>
              <h4>Share Responsibly</h4>
              <p>Collaborate with a group using account-based access instead of shared passwords.</p>
            </article>
          </div>
        </section>

        <section className="landing-section process-section">
          <h2>Privacy & Reliability</h2>
          <p>
            Your data is tied to your account and the groups you choose to share with.
            aWhere focuses on clear visibility into what was recorded and when, so you can trust what you see.
          </p>
        </section>

        <section className="landing-section developer-section">
          <h2>Developer Roles</h2>
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
