import { createRef } from 'react'
import L from 'leaflet'
import type { FIUGeofenceEntity } from '../entities/FIUGeofenceEntity'
import { geocodeAddress } from '../services/geocodingService'
import { FIUView } from './FIUView'

type Props = {
    geofences: FIUGeofenceEntity[]
    onCreateGeofence: (name: string, centerLat: number, centerLon: number, radiusMeters: number) => Promise<void>
    onUpdateGeofence: (
        geofenceId: string,
        patch: { name?: string; center_lat?: number; center_lon?: number; radius_meters?: number }
    ) => Promise<void>
    onToggleGeofenceEnabled: (geofenceId: string, enabled: boolean) => Promise<void>
}

type Mode = 'list' | 'edit'

const DEFAULT_CENTER: { lat: number; lon: number } = { lat: 40.7128, lon: -74.006 }
const DEFAULT_RADIUS_METERS = 250

type State = {
    mode: Mode
    editingId: string | null
    name: string
    radiusMeters: number
    centerLat: number
    centerLon: number
    addressQuery: string
    busy: boolean
    error: string | null
    optimisticEnabled: Record<string, boolean>
}

export class FIUGeofenceView extends FIUView<Props, State> {
    state: State = {
        mode: 'list',
        editingId: null,
        name: '',
        radiusMeters: DEFAULT_RADIUS_METERS,
        centerLat: DEFAULT_CENTER.lat,
        centerLon: DEFAULT_CENTER.lon,
        addressQuery: '',
        busy: false,
        error: null,
        optimisticEnabled: {},
    }

    private mapContainerRef = createRef<HTMLDivElement>()
    private miniMap: L.Map | null = null
    private miniMarker: L.Marker | null = null
    private miniCircle: L.Circle | null = null

    componentDidUpdate(_prevProps: Props, prevState: State): void {
        const enteredEdit = prevState.mode !== 'edit' && this.state.mode === 'edit'
        const exitedEdit = prevState.mode === 'edit' && this.state.mode !== 'edit'

        if (enteredEdit) {
            this.initMiniMap()
            this.syncMiniMapOverlays()
            return
        }

        if (exitedEdit) {
            this.destroyMiniMap()
            return
        }

        if (this.state.mode === 'edit') {
            if (
                prevState.centerLat !== this.state.centerLat ||
                prevState.centerLon !== this.state.centerLon ||
                prevState.radiusMeters !== this.state.radiusMeters
            ) {
                this.syncMiniMapOverlays()
            }
        }
    }

    componentWillUnmount(): void {
        this.destroyMiniMap()
    }

    private getSortedGeofences(): FIUGeofenceEntity[] {
        const cleaned = (this.props.geofences ?? []).filter(
            (g): g is FIUGeofenceEntity => Boolean(g) && typeof g === 'object' && 'id' in g
        )

        return [...cleaned].sort((a, b) => {
            const aTime = a.created_at ? Date.parse(a.created_at) : 0
            const bTime = b.created_at ? Date.parse(b.created_at) : 0
            return bTime - aTime
        })
    }

    private initMiniMap(): void {
        if (this.miniMap) {
            setTimeout(() => this.miniMap?.invalidateSize(), 0)
            return
        }

        const container = this.mapContainerRef.current
        if (!container) return

        const map = L.map(container, {
            zoomControl: true,
            attributionControl: true,
        }).setView([this.state.centerLat, this.state.centerLon], 13)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map)

        map.on('click', (event: L.LeafletMouseEvent) => {
            this.setState({
                centerLat: event.latlng.lat,
                centerLon: event.latlng.lng,
            })
        })

        this.miniMap = map

        // Ensure correct sizing when rendered inside a modal.
        setTimeout(() => map.invalidateSize(), 0)
    }

    private syncMiniMapOverlays(): void {
        if (!this.miniMap) return

        const center: L.LatLngExpression = [this.state.centerLat, this.state.centerLon]

        if (!this.miniMarker) {
            this.miniMarker = L.marker(center).addTo(this.miniMap)
        } else {
            this.miniMarker.setLatLng(center)
        }

        if (!this.miniCircle) {
            this.miniCircle = L.circle(center, { radius: this.state.radiusMeters }).addTo(this.miniMap)
        } else {
            this.miniCircle.setLatLng(center)
            this.miniCircle.setRadius(this.state.radiusMeters)
        }
    }

    private destroyMiniMap(): void {
        if (!this.miniMap) return
        this.miniMap.off()
        this.miniMap.remove()
        this.miniMap = null
        this.miniMarker = null
        this.miniCircle = null
    }

    private openCreate = () => {
        this.setState({
            error: null,
            editingId: null,
            name: '',
            radiusMeters: DEFAULT_RADIUS_METERS,
            centerLat: DEFAULT_CENTER.lat,
            centerLon: DEFAULT_CENTER.lon,
            addressQuery: '',
            busy: false,
            mode: 'edit',
        })
    }

    private openEdit = (g: FIUGeofenceEntity) => {
        this.setState({
            error: null,
            editingId: g.id,
            name: g.name ?? '',
            radiusMeters: Number(g.radius_meters ?? DEFAULT_RADIUS_METERS),
            centerLat: Number(g.center_lat ?? DEFAULT_CENTER.lat),
            centerLon: Number(g.center_lon ?? DEFAULT_CENTER.lon),
            addressQuery: '',
            busy: false,
            mode: 'edit',
        })
    }

    private closeEdit = () => {
        this.setState({
            mode: 'list',
            editingId: null,
            addressQuery: '',
            busy: false,
            error: null,
        })
    }

    private handleSave = async () => {
        const trimmed = this.state.name.trim()
        if (!trimmed) return

        this.setState({ error: null, busy: true })
        try {
            if (this.state.editingId) {
                await this.props.onUpdateGeofence(this.state.editingId, {
                    name: trimmed,
                    center_lat: this.state.centerLat,
                    center_lon: this.state.centerLon,
                    radius_meters: this.state.radiusMeters,
                })
            } else {
                await this.props.onCreateGeofence(
                    trimmed,
                    this.state.centerLat,
                    this.state.centerLon,
                    this.state.radiusMeters
                )
            }

            this.closeEdit()
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to save geofence.'),
            })
        } finally {
            this.setState({ busy: false })
        }
    }

    private handleToggle = async (id: string, nextEnabled: boolean) => {
        this.setState((prev) => ({
            error: null,
            optimisticEnabled: { ...prev.optimisticEnabled, [id]: nextEnabled },
        }))

        try {
            await this.props.onToggleGeofenceEnabled(id, nextEnabled)
        } catch (err) {
            this.setState((prev) => {
                const optimisticEnabled = { ...prev.optimisticEnabled }
                delete optimisticEnabled[id]
                return {
                    optimisticEnabled,
                    error: this.getErrorMessage(err, 'Unable to toggle geofence.'),
                }
            })
        }
    }

    private handleSearchAddress = async () => {
        const q = this.state.addressQuery.trim()
        if (!q) return

        this.setState({ error: null, busy: true })
        try {
            const res = await geocodeAddress(q)
            this.setState(
                {
                    centerLat: res.lat,
                    centerLon: res.lon,
                },
                () => {
                    this.miniMap?.setView([res.lat, res.lon], 15)
                }
            )
        } catch (err) {
            this.setState({
                error: this.getErrorMessage(err, 'Unable to find that address.'),
            })
        } finally {
            this.setState({ busy: false })
        }
    }

    render() {
        const sortedGeofences = this.getSortedGeofences()

        return (
            <div className="geofence-page">
                {this.state.error && <p className="board-management-error">{this.state.error}</p>}

                {this.state.mode === 'list' ? (
                    <>
                        <div className="geofence-list" aria-label="Geofence list">
                            {sortedGeofences.length === 0 && <p>No geofences found.</p>}
                            {sortedGeofences.map((g) => {
                                const enabled =
                                    this.state.optimisticEnabled[g.id] ?? (g.enabled !== false)
                                return (
                                    <div key={g.id} className="geofence-item">
                                        <div className="geofence-item-main">
                                            <button
                                                type="button"
                                                className="board-management-link"
                                                onClick={() => this.openEdit(g)}
                                            >
                                                {g.name}
                                            </button>
                                            <button
                                                type="button"
                                                className="board-management-button"
                                                onClick={() => this.openEdit(g)}
                                            >
                                                Edit
                                            </button>
                                        </div>

                                        <label className="geofence-toggle">
                                            <input
                                                type="checkbox"
                                                checked={enabled}
                                                onChange={(e) => {
                                                    void this.handleToggle(g.id, e.target.checked)
                                                }}
                                            />
                                            <span className="geofence-toggle-label">
                                                {enabled ? 'On' : 'Off'}
                                            </span>
                                        </label>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="geofence-actions">
                            <button
                                type="button"
                                className="board-management-button"
                                onClick={this.openCreate}
                            >
                                Add Geofence
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="board-management-subtitle" style={{ marginTop: 0 }}>
                            {this.state.editingId ? 'Edit geofence' : 'Add a geofence'}
                        </p>

                        <div className="board-management-row">
                            <input
                                className="board-management-input"
                                placeholder="Geofence name"
                                value={this.state.name}
                                onChange={(e) => this.setState({ name: e.target.value })}
                            />
                        </div>

                        <div className="geofence-radius">
                            <label className="geofence-radius-label" htmlFor="geofence-radius">
                                Radius: {Math.round(this.state.radiusMeters)} m
                            </label>
                            <input
                                id="geofence-radius"
                                className="geofence-radius-slider"
                                type="range"
                                min={25}
                                max={5000}
                                step={25}
                                value={this.state.radiusMeters}
                                onChange={(e) =>
                                    this.setState({ radiusMeters: Number(e.target.value) })
                                }
                            />
                        </div>

                        <div className="board-management-row">
                            <input
                                className="board-management-input"
                                placeholder="Search address"
                                value={this.state.addressQuery}
                                onChange={(e) => this.setState({ addressQuery: e.target.value })}
                            />
                            <button
                                type="button"
                                className="board-management-button"
                                disabled={this.state.busy || !this.state.addressQuery.trim()}
                                onClick={() => {
                                    void this.handleSearchAddress()
                                }}
                            >
                                Search
                            </button>
                        </div>

                        <div className="geofence-map" aria-label="Geofence location picker">
                            <div ref={this.mapContainerRef} className="geofence-map-container" />
                            <p className="board-management-subtitle" style={{ margin: '8px 0 0 0' }}>
                                Click on the map to set the geofence center.
                            </p>
                        </div>

                        <div className="geofence-actions">
                            <button
                                type="button"
                                className="board-management-button"
                                onClick={this.closeEdit}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="board-management-button"
                                disabled={this.state.busy || !this.state.name.trim()}
                                onClick={() => {
                                    void this.handleSave()
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </>
                )}
            </div>
        )
    }
}
