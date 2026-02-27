FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV WATCHPACK_POLLING=true
CMD ["npm", "start"]
