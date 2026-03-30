"""
trilateration.py
────────────────
Watches the MongoDB `decoded` collection for new fPort 2 (BLE) documents,
converts each beacon's RSSI → distance, runs trilateration, and writes the
result to `estimated_positions`.

Run alongside your Node stack:
    python3 trilateration.py

Requires:
    pip install pymongo scipy
"""

import time
import math
import os
from datetime import datetime, timezone

from pymongo import MongoClient, DESCENDING
from scipy.optimize import minimize

# ── Config ────────────────────────────────────────────────────────────────────

def load_env(path=".env"):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

_env      = load_env()
MONGO_URI = os.environ.get("MONGO_URI") or _env.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME   = "loraDB"

POLL_INTERVAL_S = 5

# RSSI-to-distance model:  d = 10 ^ ((TX_POWER - RSSI) / (10 * PATH_LOSS_N))
# TX_POWER: measured RSSI at 1 metre from the beacon (calibrate per beacon)
# PATH_LOSS_N: 2.0 = free space, 2.5–3.5 = typical indoor
TX_POWER    = -59   # dBm  (calibrate once you have beacons placed)
PATH_LOSS_N = 2.5

# ── Real Beacon Positions ─────────────────────────────────────────────────────
# MAC strings must be lowercase, no colons (matches decoder output format).
#
# TODO: Replace the (x, y) values with real measured coordinates in metres
#       once your beacons are physically placed on your floor plan.
#
#   Beacon 1  eb8474d6160d  — typically strongest signal
#   Beacon 2  edf17c4662d0  — typically middle signal
#   Beacon 3  def779e5366b  — typically weakest signal
#
BEACON_POSITIONS = {
    "eb8474d6160d": (0.0,  0.0),   # Beacon 1 — update with real coords
    "edf17c4662d0": (10.0, 0.0),   # Beacon 2 — update with real coords
    "def779e5366b": (5.0,  8.0),   # Beacon 3 — update with real coords
}

# Friendly names for logging
BEACON_NAMES = {
    "eb8474d6160d": "Beacon 1",
    "edf17c4662d0": "Beacon 2",
    "def779e5366b": "Beacon 3",
}

# ── RSSI → distance ───────────────────────────────────────────────────────────

def rssi_to_distance(rssi: int) -> float:
    """Convert RSSI (dBm) to estimated distance in metres."""
    return 10 ** ((TX_POWER - rssi) / (10 * PATH_LOSS_N))

# ── Trilateration ─────────────────────────────────────────────────────────────

def trilaterate(beacon_distances: list):
    """
    beacon_distances: list of ((x, y), distance_metres)
    Returns (est_x, est_y) or None if not enough beacons.
    Needs at least 3 beacons for a 2-D fix.
    """
    if len(beacon_distances) < 3:
        return None

    def residuals(point):
        px, py = point
        return sum(
            (math.sqrt((px - bx) ** 2 + (py - by) ** 2) - d) ** 2
            for (bx, by), d in beacon_distances
        )

    # Initial guess: centroid of beacon positions
    cx = sum(b[0][0] for b in beacon_distances) / len(beacon_distances)
    cy = sum(b[0][1] for b in beacon_distances) / len(beacon_distances)

    result = minimize(residuals, [cx, cy], method="Nelder-Mead")
    if result.success:
        return float(result.x[0]), float(result.x[1])
    return None

# ── Main loop ─────────────────────────────────────────────────────────────────

def process_document(doc, positions_col):
    decoded  = doc.get("decoded", {})
    mac_data = decoded.get("mac_data", [])
    dev_eui  = doc.get("devEui")
    device   = doc.get("deviceName")
    received = doc.get("receivedAt", datetime.now(timezone.utc))

    beacon_distances = []
    for entry in mac_data:
        mac_raw  = entry.get("mac", "").replace("0x", "").replace(":", "").lower()
        rssi_raw = entry.get("rssi", "0dBm")

        try:
            rssi = int(rssi_raw.replace("dBm", "").strip())
        except ValueError:
            continue

        if mac_raw not in BEACON_POSITIONS:
            print(f"  Skipping unknown MAC: {mac_raw}")
            continue

        pos      = BEACON_POSITIONS[mac_raw]
        distance = rssi_to_distance(rssi)
        name     = BEACON_NAMES.get(mac_raw, mac_raw)
        beacon_distances.append((pos, distance))
        print(f"  {name} ({mac_raw})  RSSI={rssi}dBm  dist≈{distance:.2f}m")

    if len(beacon_distances) < 3:
        print(f"Warning: Not enough known beacons for {dev_eui} "
              f"(got {len(beacon_distances)}, need 3) -- skipping")
        return

    position = trilaterate(beacon_distances)
    if position is None:
        print(f"Warning: Trilateration failed for {dev_eui}")
        return

    est_x, est_y = position

    positions_col.insert_one({
        "estimatedAt":  datetime.now(timezone.utc),
        "receivedAt":   received,
        "devEui":       dev_eui,
        "deviceName":   device,
        "x":            est_x,
        "y":            est_y,
        "beaconsUsed":  len(beacon_distances),
        "sourceDocId":  doc["_id"],
    })

    print(f"Position stored | devEui={dev_eui}  x={est_x:.2f}m  y={est_y:.2f}m  "
          f"beacons={len(beacon_distances)}")


def main():
    mongo   = MongoClient(MONGO_URI)
    db      = mongo[DB_NAME]
    col     = db["decoded"]
    pos_col = db["estimated_positions"]

    print(f"Connected to MongoDB | db={DB_NAME}")
    print(f"Polling every {POLL_INTERVAL_S}s for new fPort 2 documents ...")
    print(f"Tracking beacons:")
    for mac, name in BEACON_NAMES.items():
        pos = BEACON_POSITIONS[mac]
        print(f"  {name}: {mac}  @ {pos}")

    last_doc = col.find_one({"fPort": 2}, sort=[("_id", DESCENDING)])
    last_id  = last_doc["_id"] if last_doc else None

    if last_id:
        print(f"Starting from latest existing document, watching for newer ones ...")
    else:
        print("No existing fPort 2 documents found, waiting for new ones ...")

    while True:
        query = {"fPort": 2}
        if last_id:
            query["_id"] = {"$gt": last_id}

        new_docs = list(col.find(query).sort("_id", 1))

        for doc in new_docs:
            try:
                process_document(doc, pos_col)
                last_id = doc["_id"]
            except Exception as exc:
                print(f"Error processing document {doc.get('_id')}: {exc}")

        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
