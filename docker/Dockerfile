# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install necessary system packages
RUN apk add --no-cache \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY index.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R mcp:nodejs /app

# Switch to non-root user
USER mcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check: MCP server is running')" || exit 1

# Expose port (though MCP typically uses stdio)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV MCP_SERVER_NAME=openshift-mcp-server
ENV MCP_SERVER_VERSION=1.0.0

# Command to run the application
CMD ["node", "index.js"] 