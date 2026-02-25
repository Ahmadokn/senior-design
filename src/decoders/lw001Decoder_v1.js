function decodeCommonHeader(buffer) {
    const byte0 = buffer[0];
    const byte1 = buffer[1];
    const byte2 = buffer[2];

    const mode = byte0 & 0x03;
    const temperature = byte1;
    const ack = byte2 & 0x0f;
    const batteryNibble = (byte2 >> 4) & 0x0f;

    const voltage = 2.2 + 0.1 * batteryNibble;

    return {
        mode,
        temperature,
        ack,
        voltage
    };
}

module.exports = { decodeCommonHeader };