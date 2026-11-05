FROM node:24-alpine AS verified
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY web ./web
COPY data ./data
COPY test ./test
RUN node --test test/*.test.mjs

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data POKEMMO_EXTERNAL_LOCK=1
LABEL org.opencontainers.image.source="https://github.com/dll315/pokemmo-wecom" \
      org.opencontainers.image.description="PokeMMO Chinese alpha and swarm reports with WeCom notifications"
WORKDIR /app
COPY --from=verified --chown=node:node /app/src ./src
COPY --from=verified --chown=node:node /app/web ./web
COPY --from=verified --chown=node:node /app/data ./data
COPY --from=verified --chown=node:node /app/package.json ./package.json
RUN apk add --no-cache flock && mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["flock", "--no-fork", "--nonblock", "/data/instance.flock", "node", "src/main.mjs"]
