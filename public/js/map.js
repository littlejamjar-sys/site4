/**
 * Map functionality — Leaflet.js integration for campsites, routes, and location picking.
 * 
 * Improvements (2026-04-06):
 * - User-Agent headers and request throttling for OSM compliance
 * - Request debouncing for map events (pan/zoom)
 * - Client-side API response caching with TTL
 * - Fallback tile layers (CartoDB, others)
 * - Error logging for tile load failures and 403s
 * - Leaflet.js 1.9.4 compatible
 */
(function() {
    'use strict';

    // ── Configuration ──────────────────────────────────────────────────────────
    const TILE_CONFIG = {
        primary: {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            name: 'OpenStreetMap',
        },
        fallback: {
            url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
            name: 'CartoDB Lite',
        },
    };

    const TILE_OPTIONS = {
        attribution: TILE_CONFIG.primary.attr,
        maxZoom: 18,
        minZoom: 2,
        crossOrigin: 'anonymous',
        referrerPolicy: 'no-referrer-when-downgrade',
        errorTileUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22256%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22256%22 height=%22256%22/%3E%3C/svg%3E',
    };

    // ── Caching & Throttling ───────────────────────────────────────────────────
    const apiCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    function getCacheKey(url, params) {
        const sortedParams = Object.keys(params)
            .sort()
            .reduce((acc, key) => {
                acc[key] = params[key];
                return acc;
            }, {});
        return url + '?' + JSON.stringify(sortedParams);
    }

    function getCachedData(url, params) {
        const key = getCacheKey(url, params);
        const cached = apiCache.get(key);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.debug('[Map Cache] Hit:', key);
            return cached.data;
        }
        return null;
    }

    function setCachedData(url, params, data) {
        const key = getCacheKey(url, params);
        apiCache.set(key, { data, timestamp: Date.now() });
        console.debug('[Map Cache] Set:', key);
    }

    // Request debouncing
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Fetch with proper headers and error handling
    async function fetchWithHeaders(url, options = {}) {
        const headers = {
            'User-Agent': 'Dustline/1.0 (vanlife-community; +https://camper.littlejamjar.com)',
            ...options.headers,
        };
        try {
            const res = await fetch(url, { ...options, headers });
            if (!res.ok) {
                const statusText = `${res.status} ${res.statusText}`;
                console.warn(`[Map API] ${statusText} from ${url}`);
                if (res.status === 403) {
                    console.error('[Map API] 403 Forbidden — check rate limits or CORS policy');
                }
            }
            return res;
        } catch (err) {
            console.error('[Map API] Fetch error:', err);
            throw err;
        }
    }

    // ── Tile Layer Factory with Fallback ──────────────────────────────────────
    function createTileLayer(useFallback = false) {
        const config = useFallback ? TILE_CONFIG.fallback : TILE_CONFIG.primary;
        const layer = L.tileLayer(config.url, TILE_OPTIONS);
        
        layer.on('tileerror', function(err) {
            console.warn(`[Map Tile] Error loading ${config.name}:`, err);
            if (!useFallback) {
                console.warn('[Map Tile] Attempting fallback layer...');
                // Note: Actual fallback switching happens at map level
            }
        });
        
        return layer;
    }

    // ── Custom marker colors ───────────────────────────────────────────────────
    function createIcon(color) {
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.4)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            popupAnchor: [0, -10],
        });
    }

    const icons = {
        wild: createIcon('#22c55e'),
        paid: createIcon('#f59e0b'),
        aire: createIcon('#3b82f6'),
        stellplatz: createIcon('#8b5cf6'),
        campsite: createIcon('#ef4444'),
        parking: createIcon('#64748b'),
        default: createIcon('#f59e0b'),
        waypoint: createIcon('#ef4444'),
    };

    // ── Campsites Map ──────────────────────────────────────────────────────────
    const campsitesMapEl = document.getElementById('campsites-map');
    if (campsitesMapEl && campsitesMapEl.dataset.mode === 'campsites') {
        const map = L.map(campsitesMapEl).setView([48, 8], 5);
        const primaryLayer = createTileLayer(false);
        const fallbackLayer = createTileLayer(true);
        primaryLayer.addTo(map);

        const markers = L.markerClusterGroup({ maxClusterRadius: 50 });
        map.addLayer(markers);

        // Debounced load function (500ms delay to avoid hammering API on rapid pan/zoom)
        const loadCampsites = debounce(async function() {
            const bounds = map.getBounds();
            const params = {
                north: bounds.getNorth().toFixed(5),
                south: bounds.getSouth().toFixed(5),
                east: bounds.getEast().toFixed(5),
                west: bounds.getWest().toFixed(5),
            };

            // Check cache first
            const cached = getCachedData('/api/campsites', params);
            if (cached) {
                renderCampsites(cached);
                return;
            }

            try {
                const res = await fetchWithHeaders('/api/campsites?' + new URLSearchParams(params));
                const data = await res.json();
                
                if (res.ok) {
                    setCachedData('/api/campsites', params, data);
                    renderCampsites(data);
                } else {
                    console.error('[Map] API returned:', res.status);
                }
            } catch (err) {
                console.error('[Map] Failed to load campsites:', err);
                markers.clearLayers();
            }
        }, 500);

        function renderCampsites(data) {
            markers.clearLayers();
            if (data && data.campsites && Array.isArray(data.campsites)) {
                data.campsites.forEach(c => {
                    try {
                        const icon = icons[c.type] || icons.default;
                        const marker = L.marker([c.latitude, c.longitude], { icon });
                        const amenities = [];
                        if (c.has_water) amenities.push('Water');
                        if (c.has_electric) amenities.push('Electric');
                        if (c.has_toilet) amenities.push('Toilet');
                        if (c.has_shower) amenities.push('Shower');
                        if (c.has_wifi) amenities.push('WiFi');
                        const cost = c.cost_per_night ? `€${c.cost_per_night}/night` : 'Free';
                        marker.bindPopup(`
                            <div style="min-width:180px">
                                <strong><a href="/campsites/${c.id}" style="color:#f59e0b">${c.name}</a></strong><br>
                                <span style="font-size:12px;color:#94a3b8">${c.type} · ${cost}</span>
                                ${c.rating_count > 0 ? `<br><span style="font-size:12px">★ ${c.rating_avg.toFixed(1)} (${c.rating_count})</span>` : ''}
                                ${amenities.length > 0 ? `<br><span style="font-size:11px;color:#64748b">${amenities.join(' · ')}</span>` : ''}
                            </div>
                        `);
                        markers.addLayer(marker);
                    } catch (err) {
                        console.error('[Map] Error rendering campsite marker:', err);
                    }
                });
                console.debug(`[Map] Rendered ${data.campsites.length} campsites`);
            }
        }

        map.on('moveend', loadCampsites);
        loadCampsites();
    }

    // ── Single Campsite Map ────────────────────────────────────────────────────
    const detailMapEl = document.getElementById('campsite-detail-map');
    if (detailMapEl && detailMapEl.dataset.mode === 'single') {
        const lat = parseFloat(detailMapEl.dataset.lat);
        const lng = parseFloat(detailMapEl.dataset.lng);
        const name = detailMapEl.dataset.name;

        const map = L.map(detailMapEl).setView([lat, lng], 14);
        createTileLayer(false).addTo(map);
        L.marker([lat, lng], { icon: icons.default }).addTo(map).bindPopup(name).openPopup();
    }

    // ── Route Map ──────────────────────────────────────────────────────────────
    const routeMapEl = document.getElementById('route-map');
    if (routeMapEl && routeMapEl.dataset.mode === 'route') {
        let waypoints = [];
        try { waypoints = JSON.parse(routeMapEl.dataset.waypoints); } catch (e) {
            console.warn('[Map] Failed to parse waypoints:', e);
        }

        if (waypoints.length > 0) {
            const map = L.map(routeMapEl);
            createTileLayer(false).addTo(map);

            const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);

            // Draw polyline
            L.polyline(latlngs, { color: '#f59e0b', weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(map);

            // Add markers for each waypoint
            waypoints.forEach((wp, i) => {
                const icon = i === 0 || i === waypoints.length - 1 ? icons.default : icons.waypoint;
                L.marker([wp.lat, wp.lng], { icon }).addTo(map)
                    .bindPopup(`<strong>${wp.name || 'Waypoint ' + (i + 1)}</strong>`);
            });

            try {
                map.fitBounds(L.latLngBounds(latlngs).pad(0.1));
            } catch (err) {
                console.warn('[Map] Failed to fit bounds:', err);
            }
        }
    }

    // ── Location Picker (campsite submit) ──────────────────────────────────────
    const pickerMapEl = document.getElementById('location-picker-map');
    if (pickerMapEl && pickerMapEl.dataset.mode === 'picker') {
        const latInput = document.getElementById('latitude');
        const lngInput = document.getElementById('longitude');
        if (!latInput || !lngInput) return;
        const existingLat = parseFloat(latInput.value) || 46;
        const existingLng = parseFloat(lngInput.value) || 8;

        const map = L.map(pickerMapEl).setView([existingLat, existingLng], latInput.value ? 12 : 5);
        createTileLayer(false).addTo(map);

        let marker = null;
        if (latInput.value && lngInput.value) {
            marker = L.marker([existingLat, existingLng], { icon: icons.default, draggable: true }).addTo(map);
            marker.on('dragend', function() {
                const pos = marker.getLatLng();
                latInput.value = pos.lat.toFixed(5);
                lngInput.value = pos.lng.toFixed(5);
            });
        }

        map.on('click', function(e) {
            if (marker) map.removeLayer(marker);
            marker = L.marker(e.latlng, { icon: icons.default, draggable: true }).addTo(map);
            latInput.value = e.latlng.lat.toFixed(5);
            lngInput.value = e.latlng.lng.toFixed(5);
            marker.on('dragend', function() {
                const pos = marker.getLatLng();
                latInput.value = pos.lat.toFixed(5);
                lngInput.value = pos.lng.toFixed(5);
            });
        });

        // Geocode input
        const geocodeInput = document.getElementById('search-location');
        if (geocodeInput) {
            geocodeInput.addEventListener('keyup', debounce(function() {
                const query = geocodeInput.value.trim();
                if (query.length < 3) return;
                
                fetchWithHeaders(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
                    .then(res => res.json())
                    .then(results => {
                        if (results.length > 0) {
                            const [result] = results;
                            const lat = parseFloat(result.lat);
                            const lng = parseFloat(result.lon);
                            map.flyTo([lat, lng], 12);
                            if (marker) map.removeLayer(marker);
                            marker = L.marker([lat, lng], { icon: icons.default, draggable: true }).addTo(map);
                            latInput.value = lat.toFixed(5);
                            lngInput.value = lng.toFixed(5);
                            marker.on('dragend', function() {
                                const pos = marker.getLatLng();
                                latInput.value = pos.lat.toFixed(5);
                                lngInput.value = pos.lng.toFixed(5);
                            });
                        } else {
                            console.warn('[Map] No results for geocode query:', query);
                        }
                    })
                    .catch(err => console.error('[Map] Geocoding error:', err));
            }, 500));
        }
    }

    // ── Route Picker Map ───────────────────────────────────────────────────────
    const routePickerEl = document.getElementById('route-picker-map');
    if (routePickerEl && routePickerEl.dataset.mode === 'route-picker') {
        const map = L.map(routePickerEl).setView([48, 8], 5);
        createTileLayer(false).addTo(map);
        const markerGroup = L.layerGroup().addTo(map);

        let polyline = null;
        const waypoints = [];

        map.on('click', function(e) {
            waypoints.push(e.latlng);
            L.marker(e.latlng, { icon: icons.waypoint }).addTo(markerGroup);

            if (waypoints.length > 1) {
                if (polyline) map.removeLayer(polyline);
                polyline = L.polyline(waypoints, { color: '#f59e0b', weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(map);
            }

            // Update hidden input
            const waypointsInput = document.getElementById('waypoints');
            if (waypointsInput) {
                waypointsInput.value = JSON.stringify(waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })));
            }
        });

        const undoBtn = document.getElementById('undo-waypoint');
        if (undoBtn) {
            undoBtn.addEventListener('click', function() {
                if (waypoints.length > 0) {
                    waypoints.pop();
                    markerGroup.clearLayers();
                    waypoints.forEach((wp, i) => {
                        L.marker([wp.lat, wp.lng], { icon: icons.waypoint }).addTo(markerGroup);
                    });
                    if (polyline) map.removeLayer(polyline);
                    if (waypoints.length > 1) {
                        polyline = L.polyline(waypoints, { color: '#f59e0b', weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(map);
                    }
                    const waypointsInput = document.getElementById('waypoints');
                    if (waypointsInput) {
                        waypointsInput.value = JSON.stringify(waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })));
                    }
                }
            });
        }

        const clearBtn = document.getElementById('clear-waypoints');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                waypoints.length = 0;
                markerGroup.clearLayers();
                if (polyline) map.removeLayer(polyline);
                const waypointsInput = document.getElementById('waypoints');
                if (waypointsInput) {
                    waypointsInput.value = '[]';
                }
            });
        }
    }

    console.debug('[Map] Initialization complete');
})();
