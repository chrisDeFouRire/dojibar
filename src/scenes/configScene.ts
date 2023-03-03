import datefns from 'date-fns'

import { Scenes, Telegraf } from "telegraf"
import { BinanceKey, DojibarContext } from "../types.js"
import B, { Binance } from 'binance-api-node'
import { escapeMD } from "../utils.js"
import { ListenerCommander } from "../BinanceListener.js"

import * as admin from '../admin.js'

export const CONFIG_WIZARD_SCENE_ID = "CONFIG_WIZARD_SCENE_ID"

const KEY_REGEX = /[A-Za-z0-9]{64}/

export function configWizard(bot: Telegraf<DojibarContext>, listenerCommander: ListenerCommander) {
	const adminLog = admin.Log(bot)

	const wizard = new Scenes.WizardScene<DojibarContext>(
		CONFIG_WIZARD_SCENE_ID,
		async (ctx) => { // get apikey
			if (!ctx) {
				console.error("no ctx")
				return
			}
			//@ts-ignore
			const apikey: string = ctx.message.text
			if (!apikey || !apikey.match(KEY_REGEX)) {
				await ctx.reply(ctx.i18n.t("not api key"))
				return await ctx.scene.leave()
			}

			//@ts-ignore
			ctx.wizard.state['apikey'] = apikey
			await ctx.replyWithMarkdownV2(escapeMD(ctx.i18n.t("enter secret key")))
			return ctx.wizard.next()
		},
		async (ctx) => { // now get apisecret
			if (!ctx || !ctx.chat || !ctx.from) {
				return
			}
			//@ts-ignore
			const apisecret: string = ctx.message.text, apikey: string = ctx.wizard.state['apikey']

			if (!apisecret || !apisecret.match(KEY_REGEX)) {
				await ctx.reply(ctx.i18n.t("not secret key"))
				return await ctx.scene.leave()
			}

			const name = ctx.from.first_name
			await ctx.replyWithMarkdownV2(escapeMD(ctx.i18n.t("config complete", { name })))

			ctx.session.key = { apikey, apisecret } as BinanceKey
			if (await testKey(ctx, ctx.session.key)) { // key is OK, start subscription
				if (!ctx.session.subscription) {
					ctx.session.subscription = {
						started: new Date(),
						validUntil: datefns.addDays(new Date, parseInt(process.env.FREE_DAYS ?? '15'))
					}
				}
			}

			listenerCommander.startListeners(ctx.session)

			ctx.reply(ctx.i18n.t("config done"))
			adminLog(`#log config done ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name}`)

			return await ctx.scene.leave()
		}
	)
	// had to use enter, or I'd get this step twice
	wizard.enter(
		async (ctx) => {
			adminLog(`#log config enter ${ctx.chat?.id} / ${ctx.from?.language_code} / ${ctx.from?.first_name}`)
			await ctx.replyWithMarkdownV2(escapeMD(ctx.i18n.t("enter api key")))
		}
	)
	return wizard
}

/**
 * Test a new Binance API key
 * @param ctx context
 * @param key key to test
 * @returns true if key works
 */
async function testKey(ctx: DojibarContext, key: BinanceKey): Promise<boolean> {
	//@ts-ignore
	const binance: Binance = B.default({
		apiKey: key.apikey,
		apiSecret: key.apisecret
	})

	try {
		const permissions = await binance.apiPermission() // https://binance-docs.github.io/apidocs/spot/en/#get-api-key-permission-user_data
		if (!permissions.enableReading) {
			await ctx.reply(ctx.i18n.t("no reading api key"))
			return false
		}
		if (permissions.enableFutures || permissions.enableInternalTransfer || permissions.enableMargin || permissions.enableSpotAndMarginTrading || permissions.enableVanillaOptions || permissions.enableWithdrawals || permissions.permitsUniversalTransfer) {
			await ctx.reply(ctx.i18n.t("too broad permissions api key"))
		}
		if (!permissions.ipRestrict) {
			await ctx.reply(ctx.i18n.t("for best security"), { parse_mode: 'MarkdownV2' })
		}
	} catch (error: any) {
		if (error.code == -2008 || error.code == -1022) {
			await ctx.reply(ctx.i18n.t("api key doesnt work"))
		} else {
			await ctx.reply(ctx.i18n.t("cannot check permissions api key"))
		}
		return false
	}
	return true
}
