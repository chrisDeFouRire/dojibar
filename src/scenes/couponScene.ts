import { Db } from "mongodb"
import datefns from 'date-fns'

import { Markup, Scenes, Telegraf } from "telegraf"
import { DojibarContext } from "../types.js"
import { escapeMD } from "../utils.js"
import * as database from '../database.js'
import * as actions from '../actions.js'

import * as admin from '../admin.js'
import { ListenerCommander } from "../BinanceListener.js"

export const COUPON_WIZARD_SCENE_ID = "COUPON_WIZARD_SCENE_ID"

export function couponWizard(bot: Telegraf<DojibarContext>, db: Db, listenerCommander: ListenerCommander) {
	const adminLog = admin.Log(bot)

	const wizard = new Scenes.WizardScene<DojibarContext>(
		COUPON_WIZARD_SCENE_ID,
		async (ctx) => {
			if (!ctx) {
				console.error("no ctx")
				return
			}
			//@ts-ignore
			const couponName: string = ctx.message.text
			if (!couponName) {
				console.error("no coupon code")
				return await ctx.scene.leave()
			}
			if (ctx.session.coupons) {
				if (ctx.session.coupons.find(each => each.coupon.toLowerCase() == couponName.toLowerCase())) {
					ctx.reply("coupon already used") // TODO i18n
					return await ctx.scene.leave()
				}
			} else {
				ctx.session.coupons = []
			}

			const coupon = await database.redeemCoupon(db, couponName)
			switch (coupon) {
				case "Depleted":
					await ctx.reply(ctx.i18n.t("coupon depleted"))
					adminLog(`#log coupon depleted ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name} - coupon ${couponName}`)
					break
				case "Expired":
					await ctx.reply(ctx.i18n.t("coupon expired"))
					adminLog(`#log coupon expired ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name} - coupon ${couponName}`)
					break
				case "NotFound":
					await ctx.reply(ctx.i18n.t("coupon not found"))
					adminLog(`#log coupon not found ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name} - coupon ${couponName}`)
					break
				default: {
					if (!ctx.session.subscription) {
						const buttons = Markup.inlineKeyboard([
							[Markup.button.callback("🛠" + ctx.i18n.t("configure button"), actions.CONFIG_ACTION)],
						])
						await ctx.reply(ctx.i18n.t("no config"), buttons)
						adminLog(`#log coupon no config ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name} - coupon ${couponName}`)
					} else {
						ctx.reply(ctx.i18n.t("coupon valid for", { freeDays: coupon.freeDays }))
						ctx.session.coupons.push({ coupon: couponName.toLowerCase(), date: new Date() })
						const expired = datefns.isBefore(ctx.session.subscription.validUntil, new Date())
						if (expired) {
							ctx.session.subscription.validUntil = new Date()
						}
						ctx.session.subscription.validUntil = datefns.addDays(ctx.session.subscription.validUntil, coupon.freeDays)
						const daysExpiry = Math.abs(datefns.differenceInCalendarDays(new Date(), ctx.session.subscription.validUntil))
						await ctx.reply(ctx.i18n.t("enjoy pay", { daysExpiry }))
						listenerCommander.startListeners(ctx.session)
						adminLog(`#log coupon ok ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name} - coupon ${couponName}`)
					}
				}
			}

			return await ctx.scene.leave()
		}
	)
	// had to use enter, or I'd get this step twice
	wizard.enter(
		async (ctx) => {
			adminLog(`#log coupon enter ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name}`)

			await ctx.replyWithMarkdownV2(escapeMD(ctx.i18n.t("enter coupon")))
		}
	)
	return wizard
}