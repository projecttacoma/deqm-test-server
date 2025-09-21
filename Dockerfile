FROM node:20

# Create app directory
WORKDIR /usr/src/app


# Run a custom ssl_setup script if available
# We need to copy package.json here as it allows us to conditionally copy the setup script
COPY package.json ./docker_ssl_setup.sh* ./
RUN chmod +x ./docker_ssl_setup.sh; exit 0
RUN ./docker_ssl_setup.sh; exit 0
ENV NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt"

# We're using this because root user can't run any post-install scripts
USER node
WORKDIR /home/node/app
# Copy all app files
COPY --chown=node:node . .
# Install dependencies
RUN npm install
# Build
RUN npm run build

# Start app
EXPOSE 3000
CMD [ "node", "build/index.js" ]
