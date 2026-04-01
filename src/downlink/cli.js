#!/usr/bin/env node
const {
    forcePosition,
    setPeriodicStrategy,
    setDownlinkStrategy,
    setPeriodicInterval,
    setHeartbeat
} = require("./commands");

const { sendDownlink } = require("./sender");

async function run() {
    const [, , command, arg] = process.argv;

    let buffer;

    switch (command) {
        case "force-position":
            buffer = forcePosition();
            break;

        case "set-periodic-strategy":
            buffer = setPeriodicStrategy(arg);
            break;

        case "set-downlink-strategy":
            buffer = setDownlinkStrategy(arg);
            break;

        case "set-periodic-interval":
            buffer = setPeriodicInterval(parseInt(arg));
            break;

        case "set-heartbeat":
            buffer = setHeartbeat(parseInt(arg));
            break;

        default:
            console.log("Invalid command");
            process.exit(1);
    }

    await sendDownlink(buffer);
}

run();