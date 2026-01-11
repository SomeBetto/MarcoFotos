# Stage 1: Build the React Frontend
FROM node:18-alpine as client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
# Install dependencies including dev dependencies (vite)
RUN npm install
COPY client/ .
RUN npm run build

# Stage 2: Setup the Node.js Server
FROM node:18-alpine
WORKDIR /app

# Copy server dependencies
COPY server/package.json ./
RUN npm install --production

# Copy server code
COPY server/index.js ./

# Copy built frontend from Stage 1 to server's public directory
COPY --from=client-builder /app/client/dist ./public

# Create photos directory
RUN mkdir photos

EXPOSE 3000
CMD ["npm", "start"]
