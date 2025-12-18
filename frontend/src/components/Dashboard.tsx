import { useRef, useEffect, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { authService } from '../services/authService'
import { supabase } from '../services/supabaseClient'
import './Dashboard.css'

interface DashboardProps {
  userEmail: string | undefined
  onLogout: () => void
}

interface Board {
  id: string
  display_name: string
}

interface LocationLog {
  device_id: string
  latitude: number
  longitude: number
  accuracy_meters: number
  recorded_at: string
}

export function Dashboard({ userEmail, onLogout }: DashboardProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])

  const [menuOpen, setMenuOpen] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [locations, setLocations] = useState<LocationLog[]>([])

  // ----------------------------------
  // Fetch boards owned by active user
  // ----------------------------------
  useEffect(() => {
    const fetchBoardsAndLocations = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      console.log('Authenticated user ID:', user.id)

      

      if (!user) {
        console.error('No authenticated user')
        return
      }

      // 1️⃣ Fetch boards owned by this user
      const { data: devices, error: deviceError } = await supabase
        .from('devices')
        .select('id, display_name')
        .eq('owner_id', user.id)

      if (deviceError) {
        console.error('Device fetch error:', deviceError)
        return
      }

      setBoards(devices)

      if (devices.length === 0) return

      const deviceIds = devices.map((d) => d.id)

      // 2️⃣ Fetch latest location logs for those devices
      const { data: logs, error: logError } = await supabase
        .from('location_logs')
        .select('device_id, latitude, longitude, accuracy_meters, recorded_at')
        .in('device_id', deviceIds)
        .order('recorded_at', { ascending: false })

      if (logError) {
        console.error('Location fetch error:', logError)
        return
      }

      // Deduplicate to latest per device
      const latestByDevice = new Map<string, LocationLog>()
      logs.forEach((log) => {
        if (!latestByDevice.has(log.device_id)) {
          latestByDevice.set(log.device_id, log)
        }
      })

      setLocations(Array.from(latestByDevice.values()))
    }

    fetchBoardsAndLocations()
  }, [])

  // ----------------------------------
  // Initialize map (once)
  // ----------------------------------
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    })

    const map = L.map(mapRef.current).setView([40.7128, -74.0060], 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapInstance.current = map
  }, [])

  // ----------------------------------
  // Render markers for user boards
  // ----------------------------------
  useEffect(() => {
    if (!mapInstance.current) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    locations.forEach((loc) => {
      const board = boards.find((b) => b.id === loc.device_id)

      const marker = L.marker([loc.latitude, loc.longitude])
        .addTo(mapInstance.current!)
        .bindPopup(`
          <strong>${board?.display_name ?? 'Unknown Board'}</strong><br/>
          Accuracy: ${loc.accuracy_meters} m<br/>
          Updated: ${new Date(loc.recorded_at).toLocaleString()}
        `)

      markersRef.current.push(marker)
    })
  }, [locations, boards])

  const handleLogout = async () => {
    await authService.signOut()
    onLogout()
  }

  return (
    <div className="dashboard-root">
      {/* Map */}
      <div ref={mapRef} className="map-container" />

      {/* Account menu */}
      <div className="account-menu">
        <button
          className="account-button"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          Account ⌄
        </button>

        {menuOpen && (
          <div className="account-dropdown">
            <p className="account-email">{userEmail}</p>
            <button className="signout-button" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Boards legend */}
      <div className="boards-legend">
        <h4>Boards</h4>
        {boards.length === 0 && <p>No boards found</p>}
        {boards.map((board) => {
          const hasLocation = locations.some(
            (l) => l.device_id === board.id
          )
          return (
            <div key={board.id} className="board-item">
              <span
                className={`status-dot ${hasLocation ? 'online' : 'offline'}`}
              />
              {board.display_name}
            </div>
          )
        })}
      </div>
    </div>
  )
}
