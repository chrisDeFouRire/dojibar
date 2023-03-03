# Dojibar 

## Introduction

Dojibar is an open source Telegram bot to receive notifications when your Binance orders are executed.

It's provided as is.

This project had to be halted when Binance/France/Europe/whoever banned all french citizens from trading derivatives.
If it sounds like a rant, it's because it is one!

It's all written in Typescript, and runs on Node.js and Mongodb.

## Deploying

I used Kubernetes to deploy Dojibar. For development, I was using a local `.env` (see .env-template) and localtunnel which gives you a URL with SSL to work with. Anyway there's a Dockerfile you can use to create a docker image.

Dojibar uses Mongodb to store the few data it keeps. It should be quite anonymous as I'm trying hard not to store personal data.
It should be super easy to replace Mongo with anything more to your taste.

You'll have to figure out the creation of a Bot in Telegram, the configuration and all... I can help you if needed, but you should consider this project as a source of inspiration for what can be done and how, not as a ready to deploy Telegram bot. It's not meant to be that.

## Compilation

Run `tsc -w` and `yarn run dev` for development. `yarn` to install dependencies.

## Upgrading deps

`npx npm-check-updates` to see what deps should be upgraded.

`npx npm-check-updates -u` to upgrade. Then run `yarn`.