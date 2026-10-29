FROM node:22-alpine

WORKDIR /app

# Python and the tools that build the wheels of the project's own packages
# (brasidatacenter, ontobdc) from their source every time the app starts.
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/wheel-build \
    && /opt/wheel-build/bin/pip install --no-cache-dir build setuptools wheel "hatchling>=1.27"
ENV PATH="/opt/wheel-build/bin:${PATH}"

# The lockfile pins every dependency to the versions the tests ran with.
COPY src/package.json src/package-lock.json ./

RUN npm ci --no-audit --no-fund


COPY src/ ./

EXPOSE 5173

CMD ["npm", "run", "dev"]
