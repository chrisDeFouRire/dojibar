import { Db } from "mongodb"
import { Scenes, Telegraf } from "telegraf"
import { DojibarContext } from "../types.js"

import * as database from "../database.js"

export const BROADCAST_SCENE_ID = "BROADCAST_SCENE_ID"

export function broadcastWizard(bot: Telegraf<DojibarContext>, db: Db) {
	const wizard = new Scenes.WizardScene<DojibarContext>(
		BROADCAST_SCENE_ID,
		async (ctx: DojibarContext) => { // get language
			//@ts-ignore
			const lang: string = ctx.message.text

			//@ts-ignore
			ctx.wizard.state.lang = lang
			await ctx.reply("Now give me your message")

			return ctx.wizard.next()
		},
		async (ctx) => { // get english text
			if (!ctx) {
				console.error("no ctx")
				return
			}
			//@ts-ignore
			const text: string = ctx.message.text

			await ctx.reply("Here is your message:")
			// @ts-ignore
			await bot.telegram.sendMessage(ctx.chat?.id, text, { entities: ctx.message.entities || [] })

			await ctx.reply("Is this text OK? yes | NO")

			// @ts-ignore
			ctx.wizard.state.text = text
			// @ts-ignore
			ctx.wizard.state.entities = ctx.message.entities || []
			return ctx.wizard.next()
		},
		async (ctx) => { // now get apisecret
			if (!ctx || !ctx.message) {
				console.error("no ctx")
				return
			}
			//@ts-ignore
			const text: string = ctx.message.text

			if (text == "yes") {
				const before = Date.now()
				// @ts-ignore
				await ctx.reply(`OK broadcasting in ${ctx.wizard.state.lang}`)
				// @ts-ignore
				const sent = await broadcast(bot, db, ctx.wizard.state.text, ctx.wizard.state.entities, ctx.wizard.state.lang)
				await ctx.reply(`Broadcasting to ${sent} users done in ${Date.now() - before} ms`)
			} else {
				await ctx.reply("broadcast canceled")
			}
			return await ctx.scene.leave()
		}
	)
	// had to use enter, or I'd get this step twice
	wizard.enter(
		async (ctx) => {
			// @ts-ignore
			await ctx.replyWithMarkdownV2("What language do you want your message to be in?")
		}
	)
	return wizard
}

async function broadcast(bot: Telegraf<DojibarContext>, db: Db, message: string, entities: any, lang: string): Promise<number> {

	let count = 0
	for await (const user of database.findSessionsByLang(db, lang)) {
		if (user.data?.chatId) {
			await bot.telegram.sendMessage(user.data.chatId, message, { entities })
			count++
		}
	}
	return count
}