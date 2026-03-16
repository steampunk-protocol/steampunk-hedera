"""
Scan MK64 RAM to find Player struct base addresses.

From n64decomp/mk64 common_structs.h, Player struct (0xDD8 bytes):
  +0x04: currentRank (s16 big-endian) — 1 to 8
  +0x08: lapCount (s16 big-endian) — 0 to 3
  +0x14: pos.x (f32 big-endian) — world coordinate
  +0x18: pos.y (f32 big-endian)
  +0x1C: pos.z (f32 big-endian)
  +0x9C: currentSpeed (f32 big-endian) — 0 to ~100

Run inside Docker:
  python3 -m emulator.scripts.scan_ram
"""
import struct
import sys
import numpy as np

try:
    import stable_retro as retro
except ImportError:
    print("stable-retro not available")
    sys.exit(1)


def register_rom():
    import shutil, os, hashlib, json
    rom_path = "/roms/mario_kart_64.z64"
    if not os.path.exists(rom_path):
        print(f"ROM not found at {rom_path}")
        sys.exit(1)
    dp = retro.data.path()
    for sd in ["stable/MarioKart64-N64", "MarioKart64-N64"]:
        gd = os.path.join(dp, sd)
        os.makedirs(gd, exist_ok=True)
        for f in ["data.json", "scenario.json"]:
            s = os.path.join("/app/emulator/envs/data/MarioKart64-N64", f)
            if os.path.exists(s):
                shutil.copy2(s, gd)
        shutil.copy2(rom_path, os.path.join(gd, "rom.z64"))
        with open(rom_path, "rb") as f:
            sha = hashlib.sha1(f.read()).hexdigest()
        with open(os.path.join(gd, "rom.sha"), "w") as f:
            f.write(sha)
        with open(os.path.join(gd, "metadata.json"), "w") as f:
            json.dump({"default_state": None}, f)


def main():
    register_rom()

    env = retro.make(
        "MarioKart64-N64",
        state=retro.State.NONE,
        obs_type=retro.Observations.RAM,
    )
    env.render = lambda *a, **kw: None
    env.get_screen = lambda *a, **kw: np.zeros((240, 320, 3), dtype=np.uint8)

    obs, _ = env.reset()
    print(f"RAM size: {len(obs)} bytes ({len(obs) / 1024 / 1024:.1f} MB)")

    # Menu navigation: press A repeatedly with pauses to select options
    action = np.zeros(12, dtype=np.int8)

    # Phase 1: Wait for intro, press START
    print("Phase 1: Intro skip (START press, 120 frames)")
    for i in range(120):
        action[3] = 1 if i % 30 < 5 else 0  # pulse START
        obs, _, _, _, _ = env.step(action)

    # Phase 2: Select GP mode + character + course (A presses)
    print("Phase 2: Menu navigation (A presses, 600 frames)")
    action[3] = 0
    for i in range(600):
        action[8] = 1 if i % 20 < 5 else 0  # pulse A
        obs, _, _, _, _ = env.step(action)

    # Phase 3: Race! Hold A (accelerate) for a while
    print("Phase 3: Racing (hold A, 1800 frames = ~30s at 60fps)")
    action[8] = 1  # hold A
    for i in range(1800):
        obs, _, _, _, _ = env.step(action)

    ram = obs.tobytes()
    print(f"RAM captured at frame 2520. Scanning for Player structs...")

    # Search for Player struct patterns
    candidates = []
    for base in range(0, len(ram) - 0x100, 4):
        # currentRank at +0x04 (s16 big-endian): 1-8
        rank = struct.unpack_from(">h", ram, base + 0x04)[0]
        if rank < 1 or rank > 8:
            continue

        # lapCount at +0x08 (s16 big-endian): 0-3
        lap = struct.unpack_from(">h", ram, base + 0x08)[0]
        if lap < 0 or lap > 5:
            continue

        # currentSpeed at +0x9C (f32 big-endian): reasonable non-zero range
        speed = struct.unpack_from(">f", ram, base + 0x9C)[0]
        if np.isnan(speed) or np.isinf(speed):
            continue
        if abs(speed) < 0.1 or abs(speed) > 500:
            continue

        # pos.x at +0x14 (f32 big-endian): not NaN/Inf
        x = struct.unpack_from(">f", ram, base + 0x14)[0]
        if np.isnan(x) or np.isinf(x) or abs(x) > 100000:
            continue

        y = struct.unpack_from(">f", ram, base + 0x18)[0]
        z = struct.unpack_from(">f", ram, base + 0x1C)[0]
        if np.isnan(y) or np.isinf(y) or np.isnan(z) or np.isinf(z):
            continue

        candidates.append((base, rank, lap, speed, x, y, z))

    print(f"Found {len(candidates)} candidates:")
    for base, rank, lap, speed, x, y, z in candidates[:30]:
        print(
            f"  0x{base:06X} ({base:>8d}): "
            f"rank={rank}, lap={lap}, speed={speed:.2f}, "
            f"pos=({x:.1f}, {y:.1f}, {z:.1f})"
        )

    # Also dump a larger region around the best candidates for verification
    if candidates:
        best = candidates[0]
        base = best[0]
        print(f"\n--- Hex dump around best candidate 0x{base:06X} ---")
        for offset in range(0, 0xA0, 16):
            hex_str = " ".join(f"{ram[base+offset+i]:02X}" for i in range(16))
            print(f"  +0x{offset:04X}: {hex_str}")

    env.close()


if __name__ == "__main__":
    main()
