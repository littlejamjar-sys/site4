/**
 * Map functionality — Leaflet.js integration for campsites, routes, and location picking.
 */
(function() {
    'use strict';

    // Dark map tiles
    const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    // Custom marker colors using CSS
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
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);

        const markers = L.markerClusterGroup({ maxClusterRadius: 50 });
        map.addLayer(markers);

        function loadCampsites() {
            const bounds = map.getBounds();
            const params = new URLSearchParams({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest(),
            });
            fetch('/api/campsites?' + params)
                .then(res => res.json())
                .then(data => {
                    markers.clearLayers();
                    if (data.campsites) {
                        data.campsites.forEach(c => {
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
                        });
                    }
                })
                .catch(err => console.error('Failed to load campsites:', err));
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
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);
        L.marker([lat, lng], { icon: icons.default }).addTo(map).bindPopup(name).openPopup();
    }

    // ── Route Map ──────────────────────────────────────────────────────────────
    const routeMapEl = document.getElementById('route-map');
    if (routeMapEl && routeMapEl.dataset.mode === 'route') {
        let waypoints = [];
        try { waypoints = JSON.parse(routeMapEl.dataset.waypoints); } catch (e) {}

        if (waypoints.length > 0) {
            const map = L.map(routeMapEl);
            L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);

            const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);

            // Draw polyline
            L.polyline(latlngs, { color: '#f59e0b', weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(map);

            // Add markers for each waypoint
            waypoints.forEach((wp, i) => {
                const icon = i === 0 || i === waypoints.length - 1 ? icons.default : icons.waypoint;
                L.marker([wp.lat, wp.lng], { icon }).addTo(map)
                    .bindPopup(`<strong>${wp.name || 'Waypoint ' + (i + 1)}</strong>`);
            });

            map.fitBounds(L.latLngBounds(latlngs).pad(0.1));
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
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);

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

        // Also update marker from manual input
        function updateFromInputs() {
            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);
            if (!isNaN(lat) && !isNaN(lng)) {
                if (marker) map.removeLayer(marker);
                marker = L.marker([lat, lng], { icon: icons.default, draggable: true }).addTo(map);
                map.setView([lat, lng], 12);
                marker.on('dragend', function() {
                    const pos = marker.getLatLng();
                    latInput.value = pos.lat.toFixed(5);
                    lngInput.value = pos.lng.toFixed(5);
                });
            }
        }
        latInput.addEventListener('change', updateFromInputs);
        lngInput.addEventListener('change', updateFromInputs);
    }

    // ── Route Picker (route submit) ────────────────────────────────────────────
    const routePickerEl = document.getElementById('route-picker-map');
    if (routePickerEl && routePickerEl.dataset.mode === 'route-picker') {
        const waypointsInput = document.getElementById('waypoints');
        let waypoints = [];
        try { waypoints = JSON.parse(waypointsInput.value) || []; } catch (e) {}

        const map = L.map(routePickerEl).setView([48, 8], 5);
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 18 }).addTo(map);

        let polyline = null;
        const markerGroup = L.layerGroup().addTo(map);

        function redraw() {
            markerGroup.clearLayers();
            if (polyline) map.removeLayer(polyline);

            waypoints.forEach((wp, i) => {
                const m = L.marker([wp.lat, wp.lng], { icon: icons.waypoint, draggable: true }).addTo(markerGroup);
                m.bindPopup(`Waypoint ${i + 1}${wp.name ? ': ' + wp.name : ''}<br><button onclick="removeWaypoint(${i})" style="color:red;font-size:11px">Remove</button>`);
                m.on('dragend', function() {
                    const pos = m.getLatLng();
                    waypoints[i].lat = parseFloat(pos.lat.toFixed(5));
                    waypoints[i].lng = parseFloat(pos.lng.toFixed(5));
                    redraw();
                });
            });

            if (waypoints.length >= 2) {
                const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);
                polyline = L.polyline(latlngs, { color: '#f59e0b', weight: 3, opacity: 0.8, dashArray: '10, 5' }).addTo(map);
            }

            waypointsInput.value = JSON.stringify(waypoints);
        }

        map.on('click', function(e) {
            const name = prompt('Waypoint name (optional):') || '';
            waypoints.push({ lat: parseFloat(e.latlng.lat.toFixed(5)), lng: parseFloat(e.latlng.lng.toFixed(5)), name });
            redraw();
        });

        // Global function for remove button in popup
        window.removeWaypoint = function(index) {
            waypoints.splice(index, 1);
            redraw();
        };

        redraw();
    }

})();
