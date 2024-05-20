FROM node:20-alpine AS base
RUN apk update && apk add --no-cache libc6-compat kubectl bash helm
RUN corepack enable && corepack prepare pnpm@latest --activate 

WORKDIR /app


FROM base AS prod-deps
COPY package.json pnpm-lock.yaml .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY tailwind.config.ts vite.config.ts tsconfig.json postcss.config.js package.json pnpm-lock.yaml .
COPY app /app/app
copy public /app/public
RUN find .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/build/server /app/build/server
COPY --from=build /app/build/client /app/build/client
copy public /app/public
copy package.json .
EXPOSE 3000
CMD ["node", "node_modules/@remix-run/serve/dist/cli.js", "./build/server/index.js"]
