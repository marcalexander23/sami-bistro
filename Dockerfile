# Stage 1: build (has the TypeScript compiler)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: run (small, no compiler, no source)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
# Run as the built-in non-root user, not as root
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
