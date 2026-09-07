# syntax=docker/dockerfile:1

# The Krist API as an image.
#
# The build is split so that what ships is only what runs: compiled JavaScript,
# production dependencies, and the generated Prisma client. The Prisma CLI, the
# TypeScript toolchain and the test suite stay behind in the `build` stage —
# which the compose file still uses for the one-shot migrate and seed jobs.
#
#   docker build -t krist-api .                 the runtime image
#   docker build -t krist-build --target build . the toolchain, for migrations

ARG NODE_VERSION=22-alpine

# --------------------------------------------------------------------- base
FROM node:${NODE_VERSION} AS base
# Prisma's query engine links against OpenSSL and Alpine does not ship it.
RUN apk add --no-cache openssl
WORKDIR /app
ENV npm_config_update_notifier=false

# ------------------------------------------------------- dependencies (all)
# Its own layer, keyed on the lockfile, so editing a source file does not cost
# a reinstall.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------ dependencies (runtime only)
# Scripts are off because @prisma/client's postinstall calls a CLI that is a
# devDependency and therefore absent here. The client it would have generated
# is copied from the build stage below instead.
FROM base AS prod-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# -------------------------------------------------------------------- build
# Also the image behind `migrate` and `seed`: it has the Prisma CLI, ts-node
# and the sources those two need.
FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --------------------------------------------------------------- production
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
# The generated client and its engine binary — built against this same base
# image, so the engine matches the libc and OpenSSL underneath it.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package.json ./

# The log mail transport writes here, and uploaded avatars land here. Neither
# directory belongs to root: the process does not run as root, so it could not
# write to them if they did.
RUN mkdir -p /app/tmp/mail /app/uploads/avatars && chown -R node:node /app/tmp /app/uploads

USER node
EXPOSE 3000

# Reports degraded rather than failing when only Redis is down — which is also
# how the API itself treats it.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
