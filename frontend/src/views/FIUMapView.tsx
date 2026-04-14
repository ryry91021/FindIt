/*
    Responsibilities:
    - Display leaflet map on
            frontend

    - Displays board and
      location data using
            markers
*/

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'

const leafletIconRetinaUrl = new URL('../assets/iconRetinaUrl.png', import.meta.url).toString()
const leafletIconUrl = new URL('../assets/iconUrl.png', import.meta.url).toString()
const leafletShadowUrl = new URL('../assets/shadowUrl.png', import.meta.url).toString()

/** Leaflet-based map renderer for board locations. */
export interface FIUMapViewPort {
    init(container: HTMLDivElement): void
    render(boards: FIUBoardEntity[], locations: FIULocationRecordEntity[]): void
    renderGeofences(geofences: FIUGeofenceEntity[]): void
    destroy(): void
}

/** Leaflet-based map renderer for board locations. */
export class FIUMapView implements FIUMapViewPort {
    private map: L.Map | null = null
    private markers: L.Marker[] = []
    private geofenceLayer: L.LayerGroup | null = null
    private geofenceCircles: L.Circle[] = []

    private lastFitDeviceKey: string | null = null

    /** Tears down the Leaflet instance (useful for React dev/StrictMode remounts). */
    destroy(): void {
        try {
            this.map?.remove()
        } finally {
            this.map = null
            this.geofenceLayer = null
            this.markers = []
            this.geofenceCircles = []
            this.lastFitDeviceKey = null
        }
    }

    /** Initializes the map once for the given container. */
    init(container: HTMLDivElement) {
        if (this.map) return

        // In React dev/StrictMode, components may mount/unmount/mount quickly.
        // Leaflet stores an internal id on the DOM node; if it lingers, init can throw.
        const anyContainer = container as unknown as { _leaflet_id?: unknown }
        if (anyContainer._leaflet_id != null) {
            try {
                delete anyContainer._leaflet_id
            } catch {
                anyContainer._leaflet_id = undefined
            }
        }

        // Fix default marker icons in Vite
        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: leafletIconRetinaUrl,
            iconUrl: leafletIconUrl,
            shadowUrl: leafletShadowUrl,
        })

        try {
            this.map = L.map(container).setView([40.7128, -74.006], 12)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (message.includes('Map container is already initialized')) {
                try {
                    delete anyContainer._leaflet_id
                } catch {
                    anyContainer._leaflet_id = undefined
                }
                this.map = L.map(container).setView([40.7128, -74.006], 12)
            } else {
                throw err
            }
        }

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(this.map)

        this.geofenceLayer = L.layerGroup().addTo(this.map)
    }

    /** Updates markers based on the latest board/location data. */
    render(boards: FIUBoardEntity[], locations: FIULocationRecordEntity[]) {
        if (!this.map) return

        // Clear markers
        this.markers.forEach((m) => m.remove())
        this.markers = []

        // Add markers
        locations.forEach((loc) => {
            const board = boards.find((b) => b.id === loc.device_id)

            const marker = L.marker([loc.latitude, loc.longitude])
                .addTo(this.map!)
                .bindPopup(
                    `
          <strong>${board?.display_name ?? 'Unknown Board'}</strong><br/>
          <!--Accuracy: ${loc.accuracy_meters ?? 'N/A'} m<br/>-->
          Updated: ${new Date(loc.recorded_at).toLocaleString()}
        `
                )

            this.markers.push(marker)
        })

        // Auto-fit to markers
        if (this.markers.length > 0) {
            const group = L.featureGroup(this.markers)

            const deviceKey = locations
                .map((l) => l.device_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
                .sort()
                .join('|')

            const markerBounds = group.getBounds().pad(0.2)
            const mapBounds = this.map.getBounds()
            const paddedMapBounds = mapBounds.pad(-0.15)

            const markerSetChanged = deviceKey !== this.lastFitDeviceKey
            const markersOutOfView =
                paddedMapBounds.isValid() && markerBounds.isValid() ? !paddedMapBounds.contains(markerBounds) : true

            if (markerSetChanged || markersOutOfView) {
                this.lastFitDeviceKey = deviceKey
                this.map.fitBounds(markerBounds)
            }
        }
    }

    /** Updates geofence circles based on enabled geofences. */
    renderGeofences(geofences: Array<FIUGeofenceEntity | null | undefined> | null | undefined) {
        if (!this.map || !this.geofenceLayer) return

        this.geofenceCircles.forEach((c) => c.remove())
        this.geofenceCircles = []

        ;(geofences ?? [])
            .filter((g): g is FIUGeofenceEntity =>
                g != null && typeof g === 'object' && 'center_lat' in g && 'center_lon' in g
            )
            .filter((g) => (g as Partial<FIUGeofenceEntity> | null | undefined)?.enabled !== false)
            .forEach((g) => {
                const circle = L.circle([g.center_lat, g.center_lon], {
                    radius: g.radius_meters,
                    color: g.color ?? '#3388ff',
                    fillColor: g.color ?? '#3388ff',
                })
                    .addTo(this.geofenceLayer!)
                    .bindPopup(
                        `<strong>${g.name}</strong><br/>Radius: ${Math.round(g.radius_meters)} m`
                    )

                this.geofenceCircles.push(circle)
            })
    }
}
