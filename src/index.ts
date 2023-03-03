import sms from 'source-map-support'
sms.install()
import localtunnel from 'localtunnel'

import express, { Request, Response } from 'express'
import { MongoClient } from 'mongodb'
import amqplib from 'amqplib'

import https from 'https'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { BinanceMerch } from 'bmerch'

import { newBot } from './bot.js'
import { SpotListener } from './spotListener.js'
import { FutureListener } from './futureListener.js'

import { webhook } from './binanceWebhook.js'
import { binanceWebhookCheck } from './middleware.js'
import { SUB_CHANGED_EXCHANGE } from './types.js'
import { ListenerCommander } from './BinanceListener.js'

let telegramAgent = https.globalAgent

// setup SOCKS agent to use a static IP for Binance access
if (process.env.SOCKS) {
	console.log("Using SOCKS for static IP")
	const agent = new SocksProxyAgent(process.env.SOCKS)
	https.globalAgent = agent
}

// CONFIGURATION and ENVIRONMENT
if (!process.env.BOT_TOKEN || !process.env.MONGO_URL || !process.env.BINANCE_APIKEY || !process.env.BINANCE_SECRETKEY || !process.env.MERCH_APIKEY || !process.env.MERCH_APISECRET || !process.env.RABBIT_URL) {
	console.error("Env var missing: BOT_TOKEN || MONGO_URL || BINANCE_APIKEY || BINANCE_SECRETKEY || MERCH_APIKEY || MERCH_APISECRET || RABBIT_URL")
	process.exit(-1)
}
const isProduction = process.env.NODE_ENV == "production"

const port = parseInt(process.env.PORT ?? "3000")
const dbName = process.env.DB_NAME ?? "dojibarbot"

process.on('unhandledRejection', console.error)

// RABBITMQ

const rabbitConn = await amqplib.connect(process.env.RABBIT_URL)
const ch = await rabbitConn.createChannel()
await ch.assertExchange(SUB_CHANGED_EXCHANGE, 'fanout', { durable: true })
await ch.close()

// MONGODB
const db = (await MongoClient.connect(process.env.MONGO_URL)).db(dbName)
console.log("Connected to mongodb: ", process.env.MONGO_URL, "database:", dbName)

// TODO binance.us support requires setting a different baseURL
const merch = new BinanceMerch(process.env.MERCH_APIKEY, process.env.MERCH_APISECRET, { timeout: 10000 }) // baseURL defaults to intl version

// BOT
const spotListener = new SpotListener(db, rabbitConn)
const futureListener = new FutureListener(db, rabbitConn)
const channel = await rabbitConn.createChannel()
const listenerCommander = new ListenerCommander(channel)
const bot = newBot(process.env.BOT_TOKEN, db, listenerCommander, merch, telegramAgent)
const started = spotListener.start(bot)
const fstarted = futureListener.start(bot)

// EXPRESS
const app = express()
app.get('/health', (req: Request, res: Response) => res.send('OK'))
app.post('/binancewebhook', express.raw({ type: 'application/json' }), binanceWebhookCheck.bind(null, merch), webhook.bind(null, bot, db))

// TELEGRAF
if (isProduction) { // use webhook for production
	if (!process.env.BASENAME) {
		console.error("Env var missing: BASENAME")
		process.exit(-1)
	}

	// Set the bot API endpoint
	const secretPath = `/telegraf/${bot.secretPathComponent()}`
	bot.telegram.setWebhook(`https://${process.env.BASENAME}${secretPath}`)
	app.use(bot.webhookCallback(secretPath))

} else { // use launch for development
	bot.launch()
	console.log("Bot launched")

	const tunnel = await localtunnel({ port: port, subdomain: 'doji' })

	//console.log(`sslbot is proxied through ${tunnel.url} !`)
	console.log(`DEV: Tunnel at ${tunnel.url}`)
	tunnel.on('close', () => {
		process.exit(1)
	})
}
app.listen(port, () => {
	console.log('HTTP listener started')
})
