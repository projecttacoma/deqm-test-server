FROM dhi.io/node:24-dev AS deps

# Run a custom ssl_setup script if available
# We need to copy package.json here as it allows us to conditionally copy the setup script
COPY package.json ./docker_ssl_setup.sh* ./
RUN chmod +x ./docker_ssl_setup.sh; exit 0
RUN ./docker_ssl_setup.sh; exit 0
ENV NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"

# Force install of older npm due to bug https://github.com/npm/cli/issues/9133
RUN npm install --global npm@'<11.12.0'

# We're using this because root user can't run any post-install scripts
USER node
WORKDIR /home/node/app

# Copy just package and package.lock of all parts of the project for just grabbing deps
COPY --chown=node:node package.json package-lock.json ./
ENV NODE_ENV=development

# Install dependencies
RUN npm install --prefer-online=true

FROM deps AS build

USER node

# Copy all app files
COPY --chown=node:node tsconfig.json .
COPY --chown=node:node src ./src

# Build
RUN npm run build
# Install only runtime dependencies
ENV NODE_ENV=production
RUN npm install --omit=dev

FROM dhi.io/node:24 AS runner

USER node
WORKDIR /home/node/app

COPY --from=build --chown=node:node /home/node/app/node_modules ./node_modules
COPY --from=build --chown=node:node /home/node/app/package*.json .
COPY --from=build --chown=node:node /home/node/app/build* ./build

# Start app
EXPOSE 3000
CMD [ "node", "build/index.js" ]
