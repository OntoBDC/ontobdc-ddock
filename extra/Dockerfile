FROM node:22-alpine

WORKDIR /app

# Python and the tools that build the wheels of the project's own packages
# (brasidatacenter, ontobdc) from their source every time the app starts.
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/wheel-build \
    && /opt/wheel-build/bin/pip install --no-cache-dir build setuptools wheel "hatchling>=1.27"
ENV PATH="/opt/wheel-build/bin:${PATH}"

# The lockfile pins every dependency to the versions the tests ran with. Every addon
# declares its own dependencies in its own package.json (npm workspaces), so the manifest
# of each addon goes in before the install; up.sh passes the ones the checkout has in
# ADDON_MANIFESTS and an addon it does not have is simply not passed. --parents keeps the
# addon directory of every manifest, which is where npm looks for the workspace.
ARG ADDON_MANIFESTS
COPY --parents package.json package-lock.json ${ADDON_MANIFESTS} ./

RUN npm ci --no-audit --no-fund


COPY . ./

EXPOSE 5172

CMD ["npm", "run", "dev"]
