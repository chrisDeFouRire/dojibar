import sms from 'source-map-support'
sms.install()

import amqplib from 'amqplib'

import { MongoClient } from 'mongodb'
import { Telegraf } from 'telegraf'

import { DojibarContext, ListenerCommand, SUB_CHANGED_EXCHANGE } from './types.js'
import * as database from './database.js'
import { i18n } from './i18n.js'

import { getSubscriptionButtons } from './getSubscriptionButtons.js'
import { ListenerCommander } from './BinanceListener.js'
import * as admin from './admin.js'

// CONFIGURATION and ENVIRONMENT
if (!process.env.BOT_TOKEN || !process.env.MONGO_URL || !process.env.RABBIT_URL) {
	console.error("Env var missing: BOT_TOKEN || MONGO_URL || RABBITURL")
	process.exit(-1)
}

// RABBITMQ
const channel = await amqplib.connect(process.env.RABBIT_URL)
	.then(async (conn) => {
		const ch = await conn.createChannel()
		await ch.assertExchange(SUB_CHANGED_EXCHANGE, 'fanout', { durable: true })
		return ch
	})

const listenerCommander = new ListenerCommander(channel)

process.on('unhandledRejection', console.error)

// MONGODB
const dbName = process.env.DB_NAME ?? "dojibarbot"
const db = (await MongoClient.connect(process.env.MONGO_URL)).db(dbName)
console.log("Connected to mongodb: ", process.env.MONGO_URL, "database:", dbName)

// BOT
const bot = new Telegraf<DojibarContext>(process.env.BOT_TOKEN)

const adminLog = admin.Log(bot)

async function sendBeforeExpiry(daysBeforeExpiry: number) {
	console.log(`Sending message to users who expire in ${daysBeforeExpiry}`)
	const expiringWithinDays = database.findExpiringSessions(db, daysBeforeExpiry)
	if (daysBeforeExpiry > 0)
		for await (const session of expiringWithinDays) {
			const lang = session.data.__language_code
			const buttons = getSubscriptionButtons(lang)
			console.log(`Expiring within ${daysBeforeExpiry} days:`, session.data.firstName, session.data.chatId)
			adminLog(`#log #subbatch Expiring within ${daysBeforeExpiry} days: ${session.data.firstName} ${session.data.chatId}`)
			const when = daysBeforeExpiry > 1 ? i18n.t(lang, "in days", { daysBeforeExpiry }) : i18n.t(lang, "later today")
			const firstName = session.data.firstName
			const message = i18n.t(lang, "will expire", { firstName, when })
			await bot.telegram.sendMessage(session.data.chatId, message, buttons)
		}
	else
		for await (const session of expiringWithinDays) {
			const lang = session.data.__language_code
			const buttons = getSubscriptionButtons(lang)

			const firstName = session.data.firstName
			console.log('Expired:', firstName, session.data.chatId)
			adminLog(`#log #subbatch Expired: ${firstName} ${session.data.chatId}`)
			const message = i18n.t(lang, "sub has expired", { firstName })
			await bot.telegram.sendMessage(session.data.chatId, message, buttons)

			listenerCommander.stopListeners(session.data)
		}
}

// RUN IT
await sendBeforeExpiry(parseInt(process.env.DAYS_BEFORE ?? "5"))
await sendBeforeExpiry(1)
await sendBeforeExpiry(0)

await channel.close()

console.log('done sending')
process.exit(0)
