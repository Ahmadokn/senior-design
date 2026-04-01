function toHexByte(value) {
    return value.toString(16).padStart(2, "0").toUpperCase();
}

function buildCommand(cmdId, payloadBytes = []) {
    const length = payloadBytes.length + 1; // include cmdId
    const frame = [
        0x02, // Fixed header for config
        length,
        cmdId,
        ...payloadBytes
    ];
    return Buffer.from(frame);
}

/* ===============================
   POSITIONING COMMANDS
================================= */

// Force position
function forcePosition() {
    return buildCommand(0x01);
}

// Periodic strategy (ID 0x20)
function setPeriodicStrategy(strategy) {
    const strategies = {
        wifi: 0x01,
        ble: 0x02,
        "wifi-ble": 0x03,
        gps: 0x04,
        all: 0x07
    };

    if (!strategies[strategy]) {
        throw new Error("Invalid strategy");
    }

    return buildCommand(0x20, [strategies[strategy]]);
}

// Downlink-for-position strategy (ID 0x2D)
function setDownlinkStrategy(strategy) {
    const strategies = {
        wifi: 0x01,
        ble: 0x02,
        "wifi-ble": 0x03,
        gps: 0x04,
        all: 0x07
    };

    if (!strategies[strategy]) {
        throw new Error("Invalid strategy");
    }

    return buildCommand(0x2D, [strategies[strategy]]);
}

// Set periodic interval (seconds, 2 bytes)
function setPeriodicInterval(seconds) {
    const high = (seconds >> 8) & 0xff;
    const low = seconds & 0xff;
    return buildCommand(0x21, [high, low]);
}

// Set heartbeat interval (seconds, 2 bytes)
function setHeartbeat(seconds) {
    const high = (seconds >> 8) & 0xff;
    const low = seconds & 0xff;
    return buildCommand(0x23, [high, low]);
}

module.exports = {
    forcePosition,
    setPeriodicStrategy,
    setDownlinkStrategy,
    setPeriodicInterval,
    setHeartbeat
};