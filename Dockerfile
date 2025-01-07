# Use Node.js LTS version with explicit platform
FROM --platform=linux/amd64 node:18-slim

# Set working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json ./

# Generate yarn.lock with updated dependencies
RUN yarn install --mode=update-lockfile

# Copy the generated yarn.lock back to host
COPY . .

# Install dependencies
RUN yarn install

# Expose port 3001 (documentation server port)
EXPOSE 3001

# Set default command
CMD ["yarn", "start", "--host", "0.0.0.0"] 