# Node.js official image ব্যবহার করুন
FROM node:18-alpine

# অ্যাপ ডিরেক্টরি তৈরি
WORKDIR /usr/src/app

# package.json কপি করে dependency install
COPY package*.json ./
RUN npm install --production

# কোড কপি করুন
COPY . .

# Environment variables Render Dashboard থেকে আসবে
ENV PORT=3000

# সার্ভার চালানোর কমান্ড
CMD ["npm", "start"]
