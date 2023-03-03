import { Markup } from "telegraf"
import {Db} from 'mongodb'
import amqplib from 'amqplib'

import * as actions from './actions.js'
import { DojibarContext } from "./types.js"
import * as utils from './utils.js'
import * as database from './database.js'
import { ListenerCommander } from "./BinanceListener.js"

export async function quit(ctx: DojibarContext) {
	const buttons = Markup.inlineKeyboard([
		Markup.button.callback("😢" + ctx.i18n.t("YES"), actions.CONFIRM_QUIT_ACTION),
		Markup.button.callback("😊" + ctx.i18n.t("NO"), actions.CANCEL_QUIT_ACTION)])

	await ctx.replyWithMarkdownV2(utils.escapeMD(ctx.i18n.t("close account")), buttons)
}
export async function cancelQuit (ctx: DojibarContext)  {
	await ctx.reply(ctx.i18n.t("close canceled"))
}
export async function confirmQuit(db: Db, listenerCommander: ListenerCommander, ctx: DojibarContext & {callbackQuery: {from:{id: number}}}) {
	await ctx.reply(ctx.i18n.t("before close"))

	listenerCommander.stopListeners(ctx.session)

	await database.forgetUser(db, ctx.callbackQuery.from.id)
	await ctx.reply(ctx.i18n.t("after close"))
}
