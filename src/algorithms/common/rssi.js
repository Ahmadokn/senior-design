function rssiToDistance(rssi, txPower = -59, pathLossN = 2.5) {
    return Math.pow(10, (txPower - rssi) / (10 * pathLossN));
}

module.exports = {
    rssiToDistance
};