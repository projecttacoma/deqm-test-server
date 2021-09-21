FROM node:lts

# Create app directory
WORKDIR /usr/src/app

# Copy package files to get dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all app files
COPY . .

# Start app
EXPOSE 3000
CMD [ "npm", "start" ]
