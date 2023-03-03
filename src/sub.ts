import { Markup } from "telegraf"
import datefns from 'date-fns'
import { ObjectId , Db} from "mongodb"
import { BinanceMerch, Order } from 'bmerch'

import { DojibarContext } from "./types.js"
import * as utils from "./utils.js"
import * as database from './database.js'
import * as actions from "./actions.js"

import { getSubscriptionButtons } from "./getSubscriptionButtons.js"

export async function subscription(ctx: DojibarContext) {
	if (!ctx.session.subscription) {
		const buttons = Markup.inlineKeyboard([
			[Markup.button.callback("🛠" + ctx.i18n.t("configure button"), actions.CONFIG_ACTION)],
		])

		await ctx.reply(ctx.i18n.t("no subscription"), buttons)
		return
	}

	const until = ctx.session.subscription.validUntil
	const expires = datefns.formatDistanceToNow(until, { locale: utils.getLocale(ctx.session) })

	const expired = datefns.isBefore(until, new Date())

	const message = expired ? "sub expired" : "sub expiration"

	const buttons = getSubscriptionButtons(ctx.session.__language_code)

	await ctx.reply(ctx.i18n.t(message, { expires }), buttons)
}

export async function subscribe(db: Db, merch: BinanceMerch, ctx: DojibarContext) {
	if (!ctx.session.subscription) {
		const buttons = Markup.inlineKeyboard([
			[Markup.button.callback("🛠" + ctx.i18n.t("configure button"), actions.CONFIG_ACTION)],
		])

		await ctx.reply(ctx.i18n.t("no config"), buttons)
		return
	}

	const orderId = new ObjectId()
	const order: Order = {
		env: {
			terminalType: 'APP'
		},
		orderAmount: '5',
		currency: 'USDT',
		goods: {
			goodsCategory: "Z000",
			goodsName: "Subscription to Dojibar Telegram bot for 1 month",
			goodsType: "02",
			referenceGoodsId: "DojibarBot-1-month"
		},
		buyer: {
			buyerName: {
				firstName: ctx.callbackQuery!.from.first_name ?? 'Unknown first name',
				lastName: ctx.callbackQuery!.from.last_name ?? 'Unknown last name'
			},
			referenceBuyerId: ctx.callbackQuery!.from.id.toString(),
			buyerBrowserLanguage: ctx.callbackQuery!.from.language_code
		},
		orderExpireTime: datefns.addMinutes(new Date(), 30).getTime(),
		merchantTradeNo: orderId.toHexString(),
		returnUrl: process.env.BOT_URL
	}

	try {
		const result = await merch.createOrder(order)
		const inserted = await database.addOrder(db, ctx.callbackQuery!.from.id, orderId, order, result.data)
		if (result.data.status == "SUCCESS") {
			const { qrcodeLink, universalUrl } = result.data.data

			await ctx.replyWithPhoto(qrcodeLink)

			const buttons = Markup.inlineKeyboard([
				Markup.button.url("💸" + ctx.i18n.t("open binance"), universalUrl)])

			await ctx.replyWithMarkdownV2(utils.escapeMD(ctx.i18n.t("pay message")), buttons)
		}
	} catch (error: any) {
		await ctx.reply(ctx.i18n.t("error"))
		console.error(error)
	}
}