FROM python:3.11-slim

# Install Node.js 20 (needed for HCS publisher sidecar)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Python deps
COPY requirements.txt arena/requirements.txt
RUN pip install --no-cache-dir -r arena/requirements.txt

# Node deps for HCS publisher
COPY hcs/package.json hcs/package-lock.json* arena/hcs/
RUN cd arena/hcs && npm install --production

# App code
COPY . arena/

EXPOSE 8000

CMD ["uvicorn", "arena.main:app", "--host", "0.0.0.0", "--port", "8000"]
