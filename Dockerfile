# Use Node.js LTS version
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy the rest of the application
COPY . .

# Expose port 3001 (documentation server port)
EXPOSE 3001

# Set default command
CMD ["yarn", "start", "--host", "0.0.0.0"] 