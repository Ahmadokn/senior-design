function weightedCentroid(input) {
    const beacons = input?.beacons || [];
    if (!Array.isArray(beacons) || beacons.length < 3) return null;

    let sumW = 0;
    let sumX = 0;
    let sumY = 0;

    for (const beacon of beacons) {
        const d = Number(beacon.distance);
        if (!Number.isFinite(d) || d <= 0) continue;

        const w = 1 / Math.max(d, 0.0001);
        sumW += w;
        sumX += beacon.x * w;
        sumY += beacon.y * w;
    }

    if (sumW === 0) return null;

    return {
        x: sumX / sumW,
        y: sumY / sumW,
        meta: {
            algorithm: "weighted_centroid"
        }
    };
}

module.exports = weightedCentroid;