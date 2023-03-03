import _ from "lodash"
import * as Mongodb from "mongodb"
import amqplib from 'amqplib';

import { Telegraf } from "telegraf"
import Big from 'big.js'

import { Binance, OrderStatus } from 'binance-api-node'

import { DojibarContext } from "./types.js"
import { i18n } from './i18n.js'
import * as database from './database.js'
import { removeTrailingZeros, getBinanceConnection, escapeMD, redMD, expiredSession } from "./utils.js"
import { BinanceListener } from "./BinanceListener.js"

export const globalBinance: Binance = getBinanceConnection(process.env.BINANCE_APIKEY, process.env.BINANCE_SECRETKEY)

export class SpotListener extends BinanceListener {

	constructor(db: Mongodb.Db, rabbit: amqplib.Connection) {
		super(db, rabbit)
	}

	kind() {
		return 'spot'
	}

	/**
	 * Start the spot listener
	 * @param bot the telegraf bot
	 */
	async start(bot: Telegraf<DojibarContext>) {
		this.bot = bot

		const now = Date.now()

		const exchangeInfo = await globalBinance.exchangeInfo()
		this.symbols = _.zipObject(exchangeInfo.symbols.map(each => each.symbol), exchangeInfo.symbols)

		for await (const session of database.findSessionsWithKeyByShard(this.db, "TODO not used yet")) {
			try {
				if (!expiredSession(session.data)) await this.listen(parseInt(session.key)) // session.key is userId
				else console.log("not starting spot listener for",session.data.firstName, session.data.chatId)
			} catch (error) {
				console.error(`Can't start spot listener for ${session.data.firstName} / ${session.data.chatId}`)
				console.error(error)
			}
		}

		super.startRabbitListener()

		console.log("Spot listeners initialized in", Date.now() - now, "ms")
	}

	/**
	 * Add a new listener
	 * @param bot the Telegraf bot
	 * @param userId the user
	 * @param key the key to use
	 * @returns 
	 */
	async listen(userId: number) {
		if (this.hasListener(userId)) {
			return // already listening TODO handle changing of apikey
		}

		const session = await database.findUserSession(this.db, userId)
		if (!session) return
		if (session.data.options?.spot?.enabled === false) return

		const binance = getBinanceConnection(session.data.key.apikey, session.data.key.apisecret)

		const stop = await binance.ws.user(async (msg) => {
			if (!this.bot) {
				throw new Error("Start must be called before listen")
			}

			try {
				const session = await database.findUserSession(this.db, userId)
				if (!session) {
					console.error(`Can't load session for user ${userId}`)
					return
				}
				const { chatId, __language_code: lang } = session.data

				console.log("SPOT:", msg.eventType, "USER:", userId , "JSON:", JSON.stringify(msg))

				switch (msg.eventType) {
					case "executionReport":
						const pair = this.symbols[msg.symbol]

						const price = msg.orderType == "MARKET" ? (msg.orderStatus == "FILLED" || msg.orderStatus == "PARTIALLY_FILLED" ? msg.priceLastTrade : "Market") : removeTrailingZeros(msg.price)
						const quantity = msg.orderStatus == "PARTIALLY_FILLED" ? msg.lastTradeQuantity : msg.quantity

						const emojis = {
							CANCELED: '❌',
							NEW: '🆕',
							PARTIALLY_FILLED: '⏱',
							FILLED: '✅',
							PENDING_CANCEL: '⏱',
							REJECTED: '🛑'
						}
						// @ts-ignore
						const emoji = emojis[msg.orderStatus]

						const statuses = {
							CANCELED: i18n.t(lang, "CANCELED"),
							NEW: i18n.t(lang, "NEW"),
							PARTIALLY_FILLED: i18n.t(lang, "PARTIALLY_FILLED"),
							FILLED: i18n.t(lang, "FILLED"),
							PENDING_CANCEL: i18n.t(lang, "PENDING_CANCEL"),
							REJECTED: i18n.t(lang, "REJECTED")
						}
						// @ts-ignore
						const status = statuses[msg.orderStatus]
						const orderType = i18n.t(lang, msg.orderType)
						const side = i18n.t(lang, msg.side)
						let rest = parseFloat(msg.totalQuoteTradeQuantity) ? ` = ${removeTrailingZeros(msg.totalQuoteTradeQuantity)} ${pair.quoteAsset}` : ""
						if (msg.orderStatus == OrderStatus.NEW && msg.orderType != "MARKET") {
							rest = " = " + new Big(quantity).mul(new Big(price)).toString() + " " + pair.quoteAsset
						}
						const message = `${emoji} ${redMD('Spot')}: ${status} ${orderType} ${side}\n${removeTrailingZeros(quantity)} x #${msg.symbol}@${price}${rest}`
						this.bot.telegram.sendMessage(chatId, escapeMD(message), { parse_mode: "MarkdownV2" })
						break
					case "outboundAccountPosition":
						// const bal = msg.balances.map(balance => {
						// 	if (parseFloat(balance.locked) == 0) {
						// 		return `${balance.asset}: ${parseFloat(balance.free)}`
						// 	}
						// 	return `${balance.asset}: ${parseFloat(balance.free) + parseFloat(balance.locked)} = ${balance.free} free + ${balance.locked} locked in orders`
						// }).join('\n')
						// bot.telegram.sendMessage(key.chatId, bal)
						break

					default: {
						//@ts-ignore
						if (msg.eventType == undefined && msg.type == 'listenKeyExpired') {
							console.error(`spot listenKeyExpired, restarting ${userId}`)
							this.stop(userId)
							this.listen(userId)
							return
						}
						break
					}
				}
			} catch (error) {
				console.error(error)
			}
		})

		this.setListener(userId, stop)

		// stop() can be called to stop the notifier
		console.log("Spot listener for %s started", userId)
	}
}

