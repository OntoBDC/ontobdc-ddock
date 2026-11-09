FROM node:22-alpine

WORKDIR /app

# Python and the tools that build the wheels of the project's own packages
# (brasidatacenter, ontobdc) from their source every time the app starts.
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/wheel-build \
    && /opt/wheel-build/bin/pip install --no-cache-dir build setuptools wheel "hatchling>=1.27"
ENV PATH="/opt/wheel-build/bin:${PATH}"

# The npm the base image ships (10.9.9) cannot resolve this dependency tree: its
# peer-dependency pass crashes on vitest's peers with "Cannot read properties of
# null (reading 'edgesOut')". The install that runs at start needs this one.
RUN npm install --global npm@12.2.2 --no-audit --no-fund

COPY . ./

EXPOSE 5172

# The dependencies are installed when the container starts, over the sources the compose
# file mounts, so the install always matches the workspace the checkout has (the addons
# the installed system brings in, among them). --no-package-lock keeps that install from
# writing a lockfile back into the mounted sources.
CMD ["sh", "-c", "npm install --no-package-lock --no-audit --no-fund && npm run dev"]
