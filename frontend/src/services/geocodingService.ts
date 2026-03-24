export type GeocodeResult = {
    lat: number
    lon: number
    displayName: string
}

/**
 * Geocode a free-form address using OpenStreetMap Nominatim.
 *
 * Notes:
 * - Nominatim is rate-limited; call this from explicit user actions (e.g., Search button).
 * - Some environments may block this via CORS. Always allow map-click as fallback.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult> {
    const q = query.trim()
    if (!q) throw new Error('Please enter an address.')

    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '1')

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error('Address lookup failed. Please try again.')
    }

    const data = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>
    const first = data?.[0]
    if (!first?.lat || !first?.lon) {
        throw new Error('No results found for that address.')
    }

    const lat = Number(first.lat)
    const lon = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Geocoder returned an invalid location.')
    }

    return {
        lat,
        lon,
        displayName: first.display_name ?? q,
    }
}
