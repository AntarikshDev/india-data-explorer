# Official Playwright image — Chromium and all required system libs preinstalled.
# Keep this tag in sync with the exact `playwright` package version.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install deps (Playwright browsers already present in the base image)
COPY package.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev --ignore-scripts

# Copy source
COPY src ./src

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "src/server.js"]
