import * as Mongodb from "mongodb"
import amqplib from 'amqplib'

import { Telegraf } from "telegraf"
import Big from 'big.js'
import _ from "lodash"

import { Binance, ErrorCodes, OrderStatus } from 'binance-api-node'

import { DojibarContext } from "./types.js"
import { i18n } from './i18n.js'
import * as database from './database.js'
import { removeTrailingZeros, getBinanceConnection, escapeMD, redMD, expiredSession } from "./utils.js"
import { BinanceListener } from "./BinanceListener.js"

export const globalBinance: Binance = getBinanceConnection(process.env.BINANCE_APIKEY, process.env.BINANCE_SECRETKEY)

const emojis = {
	CANCELED: '❌',
	NEW: '🆕',
	PARTIALLY_FILLED: '⏱',
	FILLED: '✅',
	PENDING_CANCEL: '⏱',
	REJECTED: '🛑',
	EXPIRED: '❌'
}

function statuses(lang: string) {
	return {
		CANCELED: i18n.t(lang, "CANCELED"),
		NEW: i18n.t(lang, "NEW"),
		PARTIALLY_FILLED: i18n.t(lang, "PARTIALLY_FILLED"),
		FILLED: i18n.t(lang, "FILLED"),
		PENDING_CANCEL: i18n.t(lang, "PENDING_CANCEL"),
		REJECTED: i18n.t(lang, "REJECTED"),
		EXPIRED: i18n.t(lang, "EXPIRED")
	}
}

export class FutureListener extends BinanceListener {

	constructor(db: Mongodb.Db, rabbit: amqplib.Connection) {
		super(db, rabbit)
	}

	kind() {
		return 'futures'
	}

	/**
	 * Start the future listener
	 * @param bot the telegraf bot
	 */
	async start(bot: Telegraf<DojibarContext>) {
		this.bot = bot
		const now = Date.now()

		const exchangeInfo = await globalBinance.exchangeInfo()
		this.symbols = _.zipObject(exchangeInfo.symbols.map(each => each.symbol), exchangeInfo.symbols)

		for await (const session of database.findSessionsWithKeyByShard(this.db, "TODO not used yet")) {
			try {
				if (!expiredSession(session.data)) await this.listen(parseInt(session.key))
				else console.log("not starting futures listener for", session.data.firstName, session.data.chatId)
			} catch (error: any & { code: number }) {
				if (error.code === ErrorCodes.REJECTED_MBX_KEY) {
					console.error(`Futures: Invalid API key for ${session.data.firstName} / ${session.data.chatId}`)
				} else {
					console.error(error)
				}
			}
		}

		super.startRabbitListener()

		console.log("Future Listeners initialized in", Date.now() - now, "ms")
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
		if (session.data.options?.futures?.enabled === false) return

		const binance = getBinanceConnection(session.data.key.apikey, session.data.key.apisecret)

		const stop = await binance.ws.futuresUser(async (msg) => {
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

				console.log("FUTURE:", msg.eventType, "USER:", userId, "JSON:", JSON.stringify(msg))
				switch (msg.eventType) {
					case "ORDER_TRADE_UPDATE": {
						// copes with symbols like 1000SHIBUSDT which are not always found in this.symbols !
						const symbolWithoutNumbers = /^(?<num>[0-9]*)(?<symbol>.*$)/.exec(msg.symbol)?.groups?.symbol
						const pair = this.symbols[symbolWithoutNumbers ?? msg.symbol]

						let firstLine: string, secondLine: string, thirdLine: string | null = null, fourthLine: string | null = null

						const emoji = emojis[msg.orderStatus]
						if (!emoji) {
							console.error("FUTURE: BUG: UNKNOWN Order status")
							console.error(msg)
							return
						}

						// find order in mongo or null
						const dborder = await database.findOrder(this.db, msg)

						// delete message if CANCELED or EXPIRED
						if (msg.orderStatus === OrderStatus.CANCELED || msg.orderStatus === OrderStatus.EXPIRED) {
							if (dborder?.newMsg) { // delete NEW message
								await this.bot.telegram.deleteMessage(chatId, dborder.newMsg)
								await database.deleteOrder(this.db, msg)
								return
							}
						}

						const status = statuses(lang)[msg.orderStatus]
						const orderType = i18n.t(lang, msg.orderType)
						const side = i18n.t(lang, msg.side)
						const isMarketOrder = /MARKET/.exec(msg.orderType) != null
						const isFilled = /FILLED/.exec(msg.orderStatus) != null

						// this will hold the message to update for *FILLED orders, or null for sending a new message
						const messageId = null

						firstLine = `${emoji} ${redMD('Futures')}: ${status} ${orderType} ${side}`

						let quantity = msg.lastTradeQuantity == '0' && msg.quantity == '0' ? null : removeTrailingZeros(msg.quantity == '0' ? msg.lastTradeQuantity : msg.quantity)
						let price = msg.price == '0' && msg.stopPrice == '0' ? i18n.t(lang, "market") : removeTrailingZeros(msg.price == '0' ? msg.stopPrice : msg.price)
						if (isMarketOrder) {
							price = i18n.t(lang, "market")
						}
						if (isFilled) {
							quantity = removeTrailingZeros(msg.lastTradeQuantity)
							price = removeTrailingZeros(msg.priceLastTrade)
						}

						secondLine = `${quantity ? removeTrailingZeros(quantity) : i18n.t(lang, "close position")} × #${msg.symbol}@${price}`

						thirdLine = (msg.stopPrice != '0') ? i18n.t(lang, "stop") + '@' + removeTrailingZeros(msg.stopPrice) : null

						if (msg.orderStatus === OrderStatus.FILLED) {
							let summary: database.PartialsSummary = {
								profit: Big(msg.realizedProfit),
								commission: Big(msg.commission)
							}
							if (!Big(msg.lastTradeQuantity).eq(Big(msg.totalTradeQuantity))) { // has had partial orders
								console.log("SUMMARIZE BUG has had partial orders")
								summary = await database.summarizePartialOrders(this.db, msg) ?? {
									profit: Big(msg.realizedProfit),
									commission: Big(msg.commission)
								}
							}
							if (summary.profit.eq(0)) {
								thirdLine = `${redMD(i18n.t(lang, 'commission'))} = ${removeTrailingZeros(summary.commission.toString())} ${msg.commissionAsset}`
							} else {
								thirdLine = `${redMD(i18n.t(lang, "profit"))} = ${summary.profit.toString()} ${pair.quoteAsset}`
								fourthLine = `${redMD(i18n.t(lang, 'commission'))} = ${removeTrailingZeros(summary.commission.toString())} ${msg.commissionAsset}`
							}
						}

						let message = ([firstLine, secondLine, thirdLine, fourthLine])
							.filter(each => each != null).map(each => escapeMD(each!))
							.join('\n')

						// update message for FILLED and PARTIALLY_FILLED orders
						if (isFilled && dborder?.fillMsg) {
							await this.bot.telegram.editMessageText(chatId, dborder.fillMsg, undefined, escapeMD(message), { parse_mode: "MarkdownV2" })
							break
						}

						// send message
						const sent = await this.bot.telegram.sendMessage(chatId, escapeMD(message), { parse_mode: "MarkdownV2" })
						if (msg.orderStatus === OrderStatus.NEW) {
							await database.saveNewOrderMessage(this.db, msg, sent.message_id)
						} else if (isFilled) {
							await database.saveFillOrderMessage(this.db, msg, sent.message_id)
						}
						break
					}
					default: {
						//@ts-ignore
						if (msg.eventType == 'USER_DATA_STREAM_EXPIRED') {
							console.log("Futures stream expired for", userId)
							this.stop(userId)
							await this.listen(userId)
							return
						}
						break
					}
				}

			} catch (error) {
				console.error("ERROR: ", error)
				console.log(msg)
			}
		})

		this.setListener(userId, stop)

		// stop() can be called to stop the notifier
		console.log("Futures listener for %s started", userId)
	}
}