const fs = require("fs");
const path = require("path");
const { getAlgorithm, listAlgorithms } = require("../algorithms");

function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        algorithm: "trilateration",
        input: null
    };

    for (const arg of args) {
        const [key, value] = arg.split("=");
        if (key === "--algorithm") parsed.algorithm = value;
        if (key === "--input") parsed.input = value;
    }

    return parsed;
}

function main() {
    const { algorithm, input } = parseArgs();

    if (!input) {
        console.error("Usage: node src/scripts/runAlgorithm.js --algorithm=trilateration --input=path/to/input.json");
        console.error("Available algorithms:", listAlgorithms().join(", "));
        process.exit(1);
    }

    const fullPath = path.resolve(input);
    const raw = fs.readFileSync(fullPath, "utf8");
    const payload = JSON.parse(raw);

    const fn = getAlgorithm(algorithm);
    const result = fn(payload);

    console.log(JSON.stringify({
        algorithm,
        result
    }, null, 2));
}

main();