/**
 * LW001-BG PRO Decoder — v2
 * Based on official Moko Smart payload specification (Section 6)
 *
 * Port mapping:
 *   Port 1 → Heartbeat Payload
 *   Port 2 → Location Fixed Payload  (WiFi / BLE / GPS)
 *   Port 3 → Location Failure Payload (WiFi / BLE / GPS)
 *   Port 4 → Shutdown Payload
 *
 * ─────────────────────────────────────────────────────────────────
 * COMMON HEADER (Bytes 0–2)
 * ─────────────────────────────────────────────────────────────────
 * Byte 0 — Device Status
 *   Bit 0–1 : Operation mode  00=Standby 01=Periodic 10=Timing 11=Motion
 *   Bit 2   : Battery level   0=Normal   1=Low
 *   Bit 3   : Tamper alarm    0=Not triggered 1=Triggered
 *   Bit 4   : Man-Down status 0=Not idle 1=Idle
 *   Bit 5   : In motion state since last payload sent
 *   Bit 6   : Positioning type (Location payload only) 0=Normal 1=Downlink
 *
 * Byte 1 — Temperature (°C, signed)
 *   If raw value > 128 → temperature = value − 256
 *
 * Byte 2 — ACK & Battery voltage
 *   Bit 0–3 : ACK  (downlink frame count, wraps at 15)
 *   Bit 4–7 : Battery nibble → voltage = 2.2V + 100mV × nibble
 *
 * ─────────────────────────────────────────────────────────────────
 * RESERVED BYTES (Bytes 3–4, present on ALL ports)
 * ─────────────────────────────────────────────────────────────────
 * Real device firmware inserts 2 undocumented bytes after the common
 * header on every port. Observed values: 0xC0 (constant) followed by
 * a slowly incrementing counter byte (0x5E / 0x5F across consecutive
 * uplinks). These are NOT described in the spec but are always present.
 * All spec-defined payload fields are therefore offset by +2 relative
 * to the spec document (spec "byte 3" = buffer byte 5, etc.).
 */

// ─── Common Header ────────────────────────────────────────────────────────────

function decodeCommonHeader(buffer) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    const b2 = buffer[2];

    const operationModeMap = {
        0b00: "standby",
        0b01: "periodic",
        0b10: "timing",
        0b11: "motion",
    };

    const temperature = b1 > 128 ? b1 - 256 : b1;
    const battNibble  = (b2 >> 4) & 0x0f;

    return {
        operationMode:   operationModeMap[b0 & 0x03],
        lowBattery:      !!((b0 >> 2) & 0x01),
        tamperAlarm:     !!((b0 >> 3) & 0x01),
        manDown:         !!((b0 >> 4) & 0x01),
        inMotion:        !!((b0 >> 5) & 0x01),
        positioningType: ((b0 >> 6) & 0x01) === 0 ? "normal" : "downlink",
        temperature,
        ack:             b2 & 0x0f,
        voltage:         parseFloat((2.2 + 0.1 * battNibble).toFixed(1)),
    };
}

// ─── Port 1 — Heartbeat ───────────────────────────────────────────────────────
// Byte 0–2 : Common header
// Byte 3–4 : Reserved (purpose unknown; observed values: 0xC0 0x5F on port 1, 0xC0 0x5E on ports 2/3/4)
// Byte 5   : Reason for last device reboot
// Byte 6   : FW version  (bits 6–7 = major, bits 4–5 = sub, bits 0–3 = patch)
// Byte 7–10: Active State Count since last heartbeat (uint32 Big-Endian)

function decodeFPort1(buffer) {
    const common = decodeCommonHeader(buffer);

    const rebootReasonMap = {
        0x00: "restart_after_power_failure",
        0x01: "bluetooth_command_request",
        0x02: "lorawan_command_request",
        0x03: "power_on_after_normal_power_off",
    };

    const reserved     = buffer.slice(3, 5).toString("hex");
    const rebootByte = buffer[5];
    const fwByte     = buffer[6];
    const fwMajor    = (fwByte >> 6) & 0x03;
    const fwSub      = (fwByte >> 4) & 0x03;
    const fwPatch    =  fwByte       & 0x0f;

    return {
        ...common,
        fPort: 1,
        type: "heartbeat",
        reserved,
        rebootReason:     rebootReasonMap[rebootByte] ?? `unknown(0x${rebootByte.toString(16)})`,
        firmwareVersion:  `V${fwMajor}.${fwSub}.${fwPatch}`,
        activeStateCount: buffer.readUInt32BE(7),
    };
}

// ─── Port 2 — Location Fixed ──────────────────────────────────────────────────
// Byte 0–2   : Common header
// Byte 3–4   : Filler (0xC0 + counter)
// Byte 5     : Positioning success type  0x00=WiFi  0x01=Bluetooth  0x02=GPS
// Byte 6–12  : Timestamp Big-Endian → year(2) month(1) day(1) hour(1) min(1) sec(1)
// Byte 13    : Time zone (signed: if raw > 128 → raw − 256)
// Byte 14    : Length of location fixed data
// Byte 15+   : Location fixed data
//
// WiFi / BLE location data — repeating 7-byte groups:
//   Byte 0–5 : MAC address
//   Byte 6   : RSSI raw → dBm = raw − 256
//
// GPS location data:
//   Byte 0–3 : Latitude  (int32 BE; if > 0x7FFFFFFF → minus 0x100000000; then ÷ 1e7)
//   Byte 4–7 : Longitude (same)
//   Byte 8   : PDOP ÷ 10

function decodeFPort2(buffer) {
    const common = decodeCommonHeader(buffer);

    const successTypeMap = { 0x00: "wifi", 0x01: "bluetooth", 0x02: "gps" };
    const reserved          = buffer.slice(3, 5).toString("hex");
    const successTypeByte = buffer[5];
    const successType     = successTypeMap[successTypeByte] ?? `unknown(0x${successTypeByte.toString(16)})`;

    const year   = buffer.readUInt16BE(6);
    const month  = buffer[8];
    const day    = buffer[9];
    const hour   = buffer[10];
    const minute = buffer[11];
    const second = buffer[12];
    const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();

    const tzRaw    = buffer[13];
    const tzVal    = tzRaw > 128 ? tzRaw - 256 : tzRaw;
    const timezone = tzVal >= 0 ? `UTC+${tzVal}` : `UTC${tzVal}`;

    const dataLength  = buffer[14];
    const locationBuf = buffer.slice(15, 15 + dataLength);

    return {
        ...common,
        fPort: 2,
        type: "location_fixed",
        reserved,
        successType,
        timestamp,
        timezone,
        locationData: decodeLocationFixedData(successType, locationBuf),
    };
}

function decodeLocationFixedData(type, buf) {
    if (type === "wifi" || type === "bluetooth") {
        const devices = [];
        for (let i = 0; i + 6 < buf.length; i += 7) {
            const mac = Array.from(buf.slice(i, i + 6))
                .map(b => b.toString(16).padStart(2, "0").toUpperCase())
                .join(":");
            const rssiRaw = buf[i + 6];
            devices.push({ mac, rssi_dBm: rssiRaw - 256 });
        }
        return { devices };
    }

    if (type === "gps") {
        return {
            latitude:  parseFloat((buf.readInt32BE(0) / 1e7).toFixed(7)),
            longitude: parseFloat((buf.readInt32BE(4) / 1e7).toFixed(7)),
            pdop: buf[8] / 10,
        };
    }

    return { raw: buf.toString("hex") };
}

// ─── Port 3 — Location Failure ────────────────────────────────────────────────
// Byte 0–2 : Common header
// Byte 3–4 : Reserved (0xC0 0x5F on port 1, 0xC0 0x5E on ports 2/3/4)
// Byte 5   : Reason for positioning failure
// Byte 6   : Length of location failure data
// Byte 7+  : Location failure data
//
// WiFi / BLE failure data — same MAC+RSSI structure as fixed data
//
// GPS failure data:
//   Byte 0   : PDOP (÷10; 0xFF = unknown)
//   Byte 1–4 : C/N0 for 4 strongest satellites (dBm)

function decodeFPort3(buffer) {
    const common = decodeCommonHeader(buffer);

    const failureReasonMap = {
        0x00: "wifi_time_not_enough",
        0x01: "wifi_strategies_timeout",
        0x02: "wifi_module_not_detected",
        0x03: "bluetooth_time_not_enough",
        0x04: "bluetooth_strategies_timeout",
        0x05: "bluetooth_broadcasting_in_progress",
        0x06: "gps_position_time_budget_over",
        0x07: "gps_coarse_positioning_timeout",
        0x08: "gps_fine_positioning_timeout",
        0x09: "gps_positioning_time_not_enough",
        0x0A: "gps_aiding_positioning_timeout",
        0x0B: "gps_cold_start_positioning_timeout",
        0x0C: "interrupted_by_downlink_for_position",
        0x0D: "interrupted_at_start_of_movement",
        0x0E: "interrupted_at_end_of_movement",
    };

    const reserved      = buffer.slice(3, 5).toString("hex");
    const failureByte = buffer[5];
    const failureReason = failureReasonMap[failureByte] ?? `unknown(0x${failureByte.toString(16)})`;

    let failureType;
    if      (failureByte <= 0x02) failureType = "wifi";
    else if (failureByte <= 0x05) failureType = "bluetooth";
    else                          failureType = "gps";

    const dataLength = buffer[6];
    const failureBuf = buffer.slice(7, 7 + dataLength);

    return {
        ...common,
        fPort: 3,
        type: "location_failure",
        reserved,
        failureReason,
        failureType,
        failureData: decodeLocationFailureData(failureType, failureBuf),
    };
}

function decodeLocationFailureData(type, buf) {
    if (type === "wifi" || type === "bluetooth") {
        const devices = [];
        for (let i = 0; i + 6 < buf.length; i += 7) {
            const mac = Array.from(buf.slice(i, i + 6))
                .map(b => b.toString(16).padStart(2, "0").toUpperCase())
                .join(":");
            const rssiRaw = buf[i + 6];
            devices.push({ mac, rssi_dBm: rssiRaw - 256 });
        }
        return { devices };
    }

    if (type === "gps") {
        const pdopRaw = buf[0];
        return {
            pdop: pdopRaw === 0xFF ? null : pdopRaw / 10,
            carrier_to_noise_dBm: [buf[1], buf[2], buf[3], buf[4]],
        };
    }

    return { raw: buf.toString("hex") };
}

// ─── Port 4 — Shutdown ────────────────────────────────────────────────────────
// Byte 0–2 : Common header
// Byte 3–4 : Reserved (0xC0 0x5F on port 1, 0xC0 0x5E on ports 2/3/4)
// Byte 5   : Shutdown type  0x00=Bluetooth  0x01=LoRaWAN  0x02=Magnetic

function decodeFPort4(buffer) {
    const common = decodeCommonHeader(buffer);

    const shutdownTypeMap = {
        0x00: "bluetooth_command",
        0x01: "lorawan_command",
        0x02: "magnetic",
    };

    const reserved       = buffer.slice(3, 5).toString("hex");
    const shutdownByte = buffer[5];

    return {
        ...common,
        fPort: 4,
        type: "shutdown",
        reserved,
        shutdownType: shutdownTypeMap[shutdownByte] ?? `unknown(0x${shutdownByte.toString(16)})`,
    };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function decodeByFport(fPort, buffer) {
    switch (fPort) {
        case 1: return decodeFPort1(buffer);
        case 2: return decodeFPort2(buffer);
        case 3: return decodeFPort3(buffer);
        case 4: return decodeFPort4(buffer);
        default:
            return {
                fPort,
                type: "unknown",
                raw: buffer.toString("hex"),
                error: `No decoder for fPort ${fPort}`,
            };
    }
}

module.exports = { decodeByFport, decodeCommonHeader };
