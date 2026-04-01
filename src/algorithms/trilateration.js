function rssiToDistance(rssi, txPower = -59, pathLossN = 2.5) {
    return Math.pow(10, (txPower - rssi) / (10 * pathLossN));
}

function solve2x2(a11, a12, a21, a22, b1, b2) {
    const det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-9) return null;

    return {
        x: (b1 * a22 - b2 * a12) / det,
        y: (a11 * b2 - a21 * b1) / det
    };
}

function trilaterate(beacons) {
    /*
      beacons = [
        { x, y, distance },
        ...
      ]
      Needs at least 3 beacons.
    */
    if (!Array.isArray(beacons) || beacons.length < 3) return null;

    const ref = beacons[0];
    const equations = [];

    for (let i = 1; i < beacons.length; i++) {
        const b = beacons[i];

        const A = 2 * (b.x - ref.x);
        const B = 2 * (b.y - ref.y);
        const C =
            (ref.distance ** 2 - b.distance ** 2) -
            (ref.x ** 2 - b.x ** 2) -
            (ref.y ** 2 - b.y ** 2);

        equations.push({ A, B, C });
    }

    if (equations.length < 2) return null;

    // Least-squares normal equations
    let sAA = 0, sAB = 0, sBB = 0, sAC = 0, sBC = 0;

    for (const eq of equations) {
        sAA += eq.A * eq.A;
        sAB += eq.A * eq.B;
        sBB += eq.B * eq.B;
        sAC += eq.A * eq.C;
        sBC += eq.B * eq.C;
    }

    const solution = solve2x2(sAA, sAB, sAB, sBB, sAC, sBC);
    if (!solution) return null;

    return {
        x: solution.x,
        y: solution.y
    };
}

module.exports = {
    rssiToDistance,
    trilaterate
};