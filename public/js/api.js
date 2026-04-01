export async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${url} failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function getConfig() {
    return fetchJson("/api/config");
}

export async function saveConfig(payload) {
    return fetchJson("/api/config", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
}

export async function getLiveBeacons() {
    return fetchJson("/api/live-beacons");
}

export async function getPositions() {
    return fetchJson("/api/positions");
}