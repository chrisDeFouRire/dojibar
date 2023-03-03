import * as datefns from 'date-fns'
import { Db } from 'mongodb'
import { Telegraf } from 'telegraf'

import { isFromAdminUser } from "./utils.js"
import { DojibarContext } from "./types.js"
import * as database from './database.js'
import { ListenerCommander } from './BinanceListener.js'

export const Log = (bot: Telegraf<DojibarContext>) => (message: string) => bot.telegram.sendMessage(parseInt(process.env.ADMIN_ID || "0"), message)

export async function gift(db: Db, listenerCommander: ListenerCommander, ctx: DojibarContext & { message: { text: string } }) {
	if (isFromAdminUser(ctx.message)) {
		const match = /^gift (?<count>[0-9]+) days to (?<toUser>[0-9]+)$/.exec(ctx.message!.text)
		if (!match || !match.groups || !match.groups.count || !match.groups.toUser) {
			return
		}
		const count = parseInt(match.groups.count ?? '0')
		const toUser = match.groups.toUser

		const userId = parseInt(toUser.trim())

		const session = await database.findUserSession(db, userId)
		if (!session) {
			await ctx.reply(`Session not found for user ${userId}`)
			return
		}
		if (!session.data.subscription) {
			await ctx.reply(`User ${userId}/${session.data.firstName} has not started his subscription, starting it`)
			session.data.subscription = {
				started: new Date(),
				validUntil: datefns.addDays(new Date(), count)
			}
		} else {
			session.data.subscription.validUntil = datefns.addDays(session.data.subscription.validUntil, count)
		}
		await database.updateSubscription(db, userId, session.data.subscription)
		await ctx.reply(`Gave ${count} days of free use to ${userId}/${session.data.firstName}`)
		listenerCommander.startListeners(session.data)
	}
}

export async function revoke(db: Db, listenerCommander: ListenerCommander, ctx: DojibarContext & { message: { text: string } }) {
	if (isFromAdminUser(ctx.message)) {
		const match = /^revoke (?<user>[0-9]+)$/.exec(ctx.message.text)
		if (!match) {
			return
		}
		const user = match.groups?.user
		if (user) {
			const userId = parseInt(user.trim())

			const session = await database.findUserSession(db, userId)
			if (!session) {
				await ctx.reply(`Session not found for user ${userId}`)
				return
			}
			if (session.data.subscription) {
				session.data.subscription.validUntil = new Date()
				await database.updateSubscription(db, userId, session.data.subscription)
				await ctx.reply(`Revoked user ${userId}`)
				// TODO Actually stop listeners

				listenerCommander.stopListeners(session.data)
			} else {
				await ctx.reply(`User ${userId} had no subscription`)
			}
		}
	}
}

export async function createCoupon(db: Db, ctx: DojibarContext & { message: { text: string } }) {
	if (isFromAdminUser(ctx.message)) {
		const match = /^create coupon (?<coupon>[a-zA-Z0-9_]+) (?<freeDays>[0-9]+) (?<expiry>[0-9]+) (?<counter>[0-9]+) (?<description>.+)$/.exec(ctx.message.text)
		if (!match || !match.groups) {
			ctx.reply("syntax is: create coupon <name> <free days> <days before expiry> <counter> <description>")
			return
		}
		const {coupon, freeDays, expiry, counter, description} = match.groups

		const c = await database.createCoupon(db, coupon.toLowerCase(), parseInt(freeDays), parseInt(expiry), parseInt(counter), description)
		ctx.reply("Coupon "+c._id.toHexString() + " created")
	}
}