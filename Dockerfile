# ---- build stage: cài full deps + build bundle ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# tsc --noEmit (typecheck) + esbuild bundle -> dist/app.js
RUN npm run build

# ---- runtime stage: chỉ prod deps + dist ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# dist/app.js bundle với --packages=external -> vẫn cần các package prod trong node_modules
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3002
CMD ["node", "dist/app.js"]
