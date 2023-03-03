import { Scenes, Telegraf, Markup } from 'telegraf'

import { session } from 'telegraf-session-mongodb'
import { Db } from 'mongodb'
import https from 'https'
import { BinanceMerch } from 'bmerch'

import { DojibarContext, DojibarSessionData } from './types.js'
import { i18n } from './i18n.js'
import { escapeMD, isFromAdminUser } from './utils.js'

import { configWizard, CONFIG_WIZARD_SCENE_ID } from './scenes/configScene.js'
import { broadcastWizard, BROADCAST_SCENE_ID } from './scenes/broadcastScene.js'
import { couponWizard, COUPON_WIZARD_SCENE_ID } from './scenes/couponScene.js'

import * as sub from './sub.js'
import * as actions from './actions.js'
import * as admin from './admin.js'
import * as quit from './quit.js'
import { ListenerCommander } from './BinanceListener.js'

/**
 * Initialize bot middlewares and commands and all
 * @param bot telegraf bot
 * @param db mongo db
 * @param spotListener the spot listener
 * @param agent because we don't want to share with binance SOCKS agent
 */
export function newBot(botToken: string, db: Db, listenerCommander: ListenerCommander, merch: BinanceMerch, agent: https.Agent) {
	const bot = new Telegraf<DojibarContext>(botToken, {
		telegram: { agent }
	})
	const adminLog = admin.Log(bot)

	// middlewares
	bot.use(session(db, {
		sessionName: 'session',
		collectionName: 'sessions',
		sessionKeyFn: (ctx) => `${ctx.from?.id ?? ctx.callbackQuery?.from.id}`
	}))

	bot.use(i18n.middleware()) // needs session

	const stage = new Scenes.Stage<DojibarContext>([
		configWizard(bot, listenerCommander),
		broadcastWizard(bot, db),
		couponWizard(bot, db, listenerCommander)
	], {})
	bot.use(stage.middleware())

	bot.use((ctx: DojibarContext, next: () => Promise<void>) => {
		if (!ctx.session.__language_code && (ctx.from?.language_code || ctx.callbackQuery?.from?.language_code)) {
			ctx.i18n.locale(ctx.from?.language_code ?? ctx.callbackQuery?.from?.language_code) // set language according to what Telegram says
		}
		next()
	})

	// /start
	bot.start(async (ctx) => {
		if (!ctx.session) {
			ctx.session = {} as DojibarSessionData
		}
		ctx.session.chatId = ctx.chat.id
		ctx.session.shardId = ctx.chat.id % 11
		ctx.session.firstName = ctx.from.first_name
		const buttons = Markup.inlineKeyboard([
			[Markup.button.callback("🛠" + ctx.i18n.t("configure button"), actions.CONFIG_ACTION)],
			[Markup.button.callback("🗞" + ctx.i18n.t("sub button"), actions.SUBSCRIPTION_ACTION)],
			[Markup.button.callback("👋" + ctx.i18n.t("quit button"), actions.QUIT_ACTION)]
		])

		const message = await ctx.replyWithMarkdownV2(escapeMD(ctx.i18n.t('start', { name: ctx.session.firstName })), buttons)
		await ctx.pinChatMessage(message.message_id)

		if (ctx.session.subscription) {
			// TODO check if a previous subscription is already expired, show a message
		}
		adminLog(`#log new user ${ctx.chat.id} / ${ctx.from.language_code} / ${ctx.from.first_name} ${ctx.from.last_name}`)
	})

	// /help
	bot.help(async (ctx) => {
		const buttons = Markup.inlineKeyboard([
			[Markup.button.callback("🛠" + ctx.i18n.t("configure button"), actions.CONFIG_ACTION)],
			[Markup.button.callback("🗞" + ctx.i18n.t("sub button"), actions.SUBSCRIPTION_ACTION)],
			[Markup.button.callback("👋" + ctx.i18n.t("quit button"), actions.QUIT_ACTION)]
		])

		await ctx.replyWithMarkdownV2(escapeMD(ctx.i18n.t('help message')), buttons)
	})

	// /config
	async function enterConfigScene(ctx: DojibarContext) {
		await ctx.scene.enter(CONFIG_WIZARD_SCENE_ID)
	}
	bot.action(actions.CONFIG_ACTION, enterConfigScene)
	bot.command('config', enterConfigScene)

	// /bye
	bot.command('bye', quit.quit)
	bot.action(actions.QUIT_ACTION, quit.quit)
	bot.action(actions.CANCEL_QUIT_ACTION, quit.cancelQuit)
	bot.action(actions.CONFIRM_QUIT_ACTION, quit.confirmQuit.bind(null, db, listenerCommander))

	// /restart_listener
	bot.command('restart_listener', async (ctx) => {
		listenerCommander.restartListeners(ctx.session)
		await ctx.reply('Listener restarted')
	})

	//whoami
	bot.command('whoami', async (ctx) => {
		const id = ctx.from.id
		await ctx.reply(ctx.i18n.t("whoami", { id }))
	})

	// /lang
	bot.command('lang', async (ctx) => {
		const found = ctx.message.text.match(/lang (?<code>..)$/)
		if (found) {
			const code = found.groups!.code!.toLowerCase()
			if (["en", "fr", "es", "de"].indexOf(code) != -1) {
				ctx.session.__language_code = code
				await ctx.reply(i18n.t(code, "language changed"))
				return
			}
		}
		await ctx.reply(ctx.i18n.t("bad command"))
	})

	//subscription
	bot.action(actions.SUBSCRIPTION_ACTION, sub.subscription)
	bot.command("subscription", sub.subscription)
	bot.action(actions.SUBSCRIBE_ACTION, sub.subscribe.bind(null, db, merch))

	bot.action(actions.REDEEM_ACTION, async (ctx) => {
		await ctx.scene.enter(COUPON_WIZARD_SCENE_ID)
	})

	// ADMIN functions
	bot.hears('broadcast', async (ctx) => {
		if (isFromAdminUser(ctx.message)) {
			await ctx.scene.enter(BROADCAST_SCENE_ID)
		}
	})
	bot.hears(/^gift [0-9]+ days to [0-9]+$/, admin.gift.bind(null, db, listenerCommander))
	bot.hears(/^revoke [0-9]+/, admin.revoke.bind(null, db, listenerCommander))
	bot.hears(/^create coupon/, admin.createCoupon.bind(null, db))

	return bot
}
