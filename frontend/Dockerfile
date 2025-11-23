# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Run stage
FROM node:22-alpine

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install production dependencies only
RUN npm install --production

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "build"]
