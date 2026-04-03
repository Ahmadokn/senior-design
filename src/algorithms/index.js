const trilateration = require("./trilateration");
const weightedCentroid = require("./weightedCentroid");

const registry = {
    trilateration: (input) => trilateration(input.beacons),
    weighted_centroid: weightedCentroid
};

function getAlgorithm(name) {
    return registry[name] || registry.trilateration;
}

function listAlgorithms() {
    return Object.keys(registry);
}

module.exports = {
    getAlgorithm,
    listAlgorithms
};