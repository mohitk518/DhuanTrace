FROM node:22-slim
WORKDIR /app
COPY . .
# Run as the unprivileged "node" user; only the data folder is writable
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
ENV PORT=8080 NODE_ENV=production DATA_DIR=/app/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
