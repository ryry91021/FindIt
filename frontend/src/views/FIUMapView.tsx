/*
    Responsibilities:
    - Display leaflet map on
      frontend​

    - Displays board and
      location data using
      markers​
*/

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FIUBoardEntity } from '../entities/FIUBoardEntity'
import type { FIULocationRecordEntity } from '../entities/FIULocationRecordEntity'

/** Leaflet-based map renderer for board locations. */
export class FIUMapView {
    private map: L.Map | null = null
    private markers: L.Marker[] = []

    /** Initializes the map once for the given container. */
    init(container: HTMLDivElement) {
        if (this.map) return

        // Fix default marker icons in Vite
        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
        L.Icon.Default.mergeOptions({
            iconRetinaUrl:
                'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
            iconUrl:
                'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            shadowUrl:
                'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        })

        this.map = L.map(container).setView([40.7128, -74.006], 12)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(this.map)
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
            this.map.fitBounds(group.getBounds().pad(0.2))
        }
    }
}
