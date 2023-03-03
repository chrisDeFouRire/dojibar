FROM node:16-buster-slim

ENV NODE_ENV=production

RUN mkdir -p /server
WORKDIR /server

COPY package.json /server/
COPY yarn.lock /server/

RUN yarn

COPY . /server

RUN mkdir -p dist && yarn run compile

EXPOSE 3000

CMD [ "yarn", "start" ]
