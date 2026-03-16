FROM python:3.11-slim

# Install system deps for stable-retro (N64 emulation), Mesa (software GL), Xvfb
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake zlib1g-dev \
    xvfb x11-utils \
    libgl1-mesa-dri libglu1-mesa libegl1-mesa \
    libgles2-mesa-dev mesa-utils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Python deps
COPY requirements.txt emulator/requirements.txt
RUN pip install --no-cache-dir -r emulator/requirements.txt

# App code
COPY . emulator/

# Import ROM if present (ROM must be mounted or baked into image)
# To bake: COPY roms/mario_kart_64.z64 /opt/roms/
# Then: RUN python3 -m retro.import /opt/roms/ || true
# For now, ROM import happens at runtime via entrypoint or volume mount.

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
