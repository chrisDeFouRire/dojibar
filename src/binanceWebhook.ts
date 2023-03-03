import { Telegraf } from 'telegraf'
import { Request, Response } from 'express'
import { Db, ObjectId } from 'mongodb'
import { inspect } from 'util'
import datefns from 'date-fns'
import * as admin from './admin.js'

import { BinanceMerch, BinancePayHeaders, BinanceWebhook, BinanceWebhookOrderNotification } from 'bmerch'

import * as database from './database.js'
import { DojibarContext } from './types.js'
import { i18n } from './i18n.js'

export async function webhook(bot: Telegraf<DojibarContext>, db: Db, req: Request, res: Response) {

	const adminLog = admin.Log(bot)

	const daysToAdd: { [key: string]: number } = {
		"Subscription to Dojibar Telegram bot for 1 month": 31,
		"Subscription to Dojibar Telegram bot for 1 year": 365
	}

	try {
		const webhookMessage = JSON.parse(req.body.toString()) as BinanceWebhook
		console.log("WEBHOOK")
		console.log(inspect(webhookMessage, { depth: null, compact: false, breakLength: 80 }))

		const orderNotification = JSON.parse(webhookMessage.data) as BinanceWebhookOrderNotification

		const orderId = new ObjectId(orderNotification.merchantTradeNo)
		await database.pushOrderWebhookMessage(db, orderId, webhookMessage)

		switch (webhookMessage.bizStatus) {
			case 'PAY_SUCCESS': { // payment successful
				const order = await database.getOrder(db, orderId)
				if (!order) { // HOW are we supposed to react?
					console.error("WEBHOOK Couldn't find order", orderNotification.merchantTradeNo)
					res.status(200).send({ "returnCode": "SUCCESS", "returnMessage": null })
					return
				}
				if (order.payStatus == 'PAY_SUCCESS') {
					console.error("Duplicate Webhook call", orderNotification.merchantTradeNo)
					res.status(200).send({ "returnCode": "SUCCESS", "returnMessage": null })
					return
				}
				const session = await database.findUserSession(db, order.userId)
				if (session) {
					if (!session.data.subscription) {
						console.error("Webhook Payment received but user has no subscription")
						adminLog(`#log #payment BUG: Payment received but user has no subscription ${order.userId}: ${session.data.firstName} ${session.data.chatId}`)

						session.data.subscription = {
							validUntil: new Date(),
							started: new Date()
						}
					}
					const days = daysToAdd[orderNotification.productName] || 0

					const expired = datefns.isBefore(session.data.subscription.validUntil, new Date())
					if (expired) {
						session.data.subscription.validUntil = new Date()
					}
					const lang = session.data.__language_code
					session.data.subscription.validUntil = datefns.addDays(session.data.subscription.validUntil, days)
					await database.updateSubscription(db, order.userId, session.data.subscription)
					await bot.telegram.sendMessage(order.userId, i18n.t(lang, "congrats pay", { days }))
					const daysExpiry = Math.abs(datefns.differenceInCalendarDays(new Date(), session.data.subscription.validUntil))
					await bot.telegram.sendMessage(order.userId, i18n.t(lang, "enjoy pay", { daysExpiry }))
					adminLog(`#log #payment received payment from ${order.userId} ${daysExpiry} days: ${session.data.firstName} ${session.data.chatId}`)
				} else {
					console.error("BUG: no session for user", order.userId)
					adminLog(`#log #payment BUG: no session for user ${order.userId}`)
				}
				break;
			}
			case 'PAY_CLOSED': { // payment expired
				// TODO send message to user that payment has not been received and he should use /subscribe again
				break;
			}
		}
		await database.updateOrderPayStatus(db, orderId, webhookMessage.bizStatus)
		console.log(`WEBHOOK for ${orderNotification.merchantTradeNo}, status updated to ${webhookMessage.bizStatus}`)
		res.status(200).send({ "returnCode": "SUCCESS", "returnMessage": null })

	} catch (error: any) {
		console.error("WEBHOOK ERROR")
		console.error(error)
		res.status(200).send({ "returnCode": "FAIL", "returnMessage": error.toString() })
		adminLog(`#log #payment BUG: WEBHOOK ERROR ${error.toString()}`)
	}

}