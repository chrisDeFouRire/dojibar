import Big from "big.js"
import { OrderUpdate } from "binance-api-node"
import { BinanceWebhook, Order, Order_Response } from "bmerch"
import * as datefns from "date-fns"
import { Db, FindCursor, ObjectId } from "mongodb"
import { DojibarSubscription, UserSession } from "./types.js"

export type PayStatus = "PAY_SUCCESS" | "PAY_CLOSED"

export interface MongodbOrder {
	_id: ObjectId
	userId: number
	prepayId: string // the id used by Binance for this transaction
	order: Order // what is sent to create the order
	orderResponse: any // what is returned when the order is created
	webhookMessages?: Array<any> // every webhook message about this order
	payStatus?: PayStatus
}

export type CouponStatus = "NotFound" | "Expired" | "Depleted"

export interface MongoCoupon {
	_id: ObjectId
	coupon: string
	counter: number
	expiry: Date
	freeDays: number
	description: string
	_internal_notes: string
	_creation_date: Date
}

export interface MongoPartial {
	_id: string
	newMsg: number
	fillMsg?: number
	p: Array<{ c: string, ca: string | null, p: string }>
}

const sessions = (db: Db) => db.collection('sessions')
const orders = (db: Db) => db.collection<MongodbOrder>('orders')
const coupons = (db: Db) => db.collection<MongoCoupon>('coupons')
const partials = (db: Db) => db.collection<MongoPartial>('partials')

export async function findUserSession(db: Db, userId: number): Promise<UserSession | null> {
	return sessions(db).findOne<UserSession>({ key: userId.toString() })
}

export function findSessionsWithKeyByShard(db: Db, shard: string): FindCursor<UserSession> {
	//return keys(db).find({ "data.shard":shard }) as FindCursor<UserSession>
	return sessions(db).find({ "data.key": { $exists: true } }) as FindCursor<UserSession>
}

export function findSessionsByLang(db: Db, lang: string): FindCursor<UserSession> {
	return sessions(db).find({ "data.__language_code": lang }) as FindCursor<UserSession>
}

export async function forgetUser(db: Db, userId: number): Promise<any> {
	return sessions(db).updateOne({ key: userId.toString() }, { $unset: { "data.__scenes": null, "data.firstName": null, "data.__language_code": null, "data.key": null } })
}

export async function updateSubscription(db: Db, userId: number, subscription: DojibarSubscription): Promise<any> {
	return sessions(db).updateOne({ key: userId.toString() }, { $set: { "data.subscription": subscription } })
}

export async function addOrder(db: Db, userId: number, orderId: ObjectId, order: Order, orderResponse: Order_Response) {
	return orders(db).insertOne({ _id: orderId, userId, order, prepayId: orderResponse.data.prepayId, orderResponse })
}

export async function getOrder(db: Db, orderId: ObjectId): Promise<MongodbOrder | null> {
	return orders(db).findOne({ _id: orderId }) as Promise<MongodbOrder | null>
}

export async function pushOrderWebhookMessage(db: Db, orderId: ObjectId, webhookMessage: BinanceWebhook): Promise<any> {
	return orders(db).updateOne({ _id: orderId }, { $push: { webhookMessages: webhookMessage } })
}

export async function updateOrderPayStatus(db: Db, orderId: ObjectId, payStatus: PayStatus): Promise<any> {
	return orders(db).updateOne({ _id: orderId }, { $set: { payStatus } })
}

/**
 * Find sessions with subscriptions about to expire (between inDays-1 and inDays from now).
 * inDays = 0 means expired in the last 24h
 * inDays = 1 means will expire in the coming 24h
 * @param db the Db
 * @param inDays number of days from now
 * @returns Cursor
 */
export function findExpiringSessions(db: Db, inDays: number): FindCursor<UserSession> {
	const d = datefns.addDays(new Date(), inDays)
	const dminus1 = datefns.subDays(d, 1)
	return sessions(db).find({ "data.subscription.validUntil": { $gte: dminus1, $lte: d } }) as FindCursor<UserSession>
}

/**
 * Redeems a coupon code
 * @param db the Db
 * @param coupon the coupon code to redeem
 * @returns a promise for the redeemed MongoCoupon, or null if the redeem failed
 */
export async function redeemCoupon(db: Db, coupon: string): Promise<MongoCoupon | CouponStatus> {
	const updRes = await coupons(db).findOneAndUpdate({ coupon: coupon.toLowerCase(), counter: { $gte: 1 }, expiry: { $gte: new Date() } }, { $inc: { counter: -1 } }, { returnDocument: 'after' })
	if (updRes.value && updRes.ok) { // redeemed
		return updRes.value as MongoCoupon
	}

	const c = await coupons(db).findOne<MongoCoupon>({ coupon: coupon })
	if (!c) return "NotFound"
	if (c.counter == 0) return "Depleted"
	return "Expired"
}

/**
 * Creates a new coupon
 * @param db the db
 * @param coupon the coupon name
 * @param freeDays the number of days offered
 * @param expiryDays the expiry in days from now
 * @param counter the initial counter value
 * @param description the description
 * @returns 
 */
export async function createCoupon(db: Db, coupon: string, freeDays: number, expiryDays: number, counter: number, description: string): Promise<MongoCoupon> {
	const c = <MongoCoupon>{
		_id: new ObjectId(),
		coupon: coupon.toLowerCase(),
		freeDays,
		expiry: datefns.addDays(new Date(), expiryDays),
		counter,
		description,
		_creation_date: new Date(),
		_internal_notes: "created by admin in bot"
	}
	await coupons(db).insertOne(c)
	return c
}

export async function saveNewOrderMessage(db: Db, o: OrderUpdate, messageId: number) {
	return partials(db).updateOne({ _id: o.clientOrderId }, { $set: { newMsg: messageId } }, { upsert: true })
}
export async function saveFillOrderMessage(db: Db, o: OrderUpdate, messageId: number) {
	return partials(db).updateOne({ _id: o.clientOrderId }, { $set: { fillMsg: messageId } }, { upsert: true })
}

export async function findOrder(db: Db, o: OrderUpdate) {
	return partials(db).findOne({ _id: o.clientOrderId })
}

export async function deleteOrder(db: Db, o: OrderUpdate) {
	return partials(db).deleteOne({ _id: o.clientOrderId })
}

export async function savePartialOrder(db: Db, o: OrderUpdate): Promise<number | null> {
	//@ts-ignore
	return partials(db).findOneAndUpdate(
		{ _id: o.clientOrderId },
		{
			$push: {
				p: {
					c: o.commission,
					ca: o.commissionAsset,
					p: o.realizedProfit
				}
			}
		},
		{ upsert: true, returnDocument: 'before' })
		.then(res => res.value?.newMsg)
}

export async function summarizePartialOrders(db: Db, o: OrderUpdate): Promise<PartialsSummary | null> {
	const pr = await partials(db).findOne({ _id: o.clientOrderId })
	if (!pr) {
		console.log("SUMMARIZE BUG returns null")
		return null
	}
	const profit = pr.p.map(each => Big(each.p)).reduce((prev, each) => prev.add(each), Big(o.realizedProfit)) // we start the sum at profit
	const commission = pr.p.map(each => Big(each.c)).reduce((prev, each) => prev.add(each), Big(o.commission)) // and commission

	console.log("SUMMARIZE BUG pr:", JSON.stringify(pr), "profit:", profit.toString(), "-", o.realizedProfit)

	return {
		profit,
		commission
	}
}

export interface PartialsSummary {
	profit: Big
	commission: Big
}