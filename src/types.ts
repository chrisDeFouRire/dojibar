import * as Mongodb from "mongodb"
import { Context, Scenes } from "telegraf"

export const SUB_CHANGED_EXCHANGE = "sub_changed"

export interface ConfigWizardSessionData extends Scenes.WizardSessionData {
}

export interface BinanceKey {
	apikey: string
	apisecret: string
}

export interface DojibarPayment {
	date: Date
	orderId: Mongodb.ObjectId
	amount: string
	ccy: string
}

export interface DojibarSubscription {
	started: Date
	validUntil: Date
}

export interface UsedCoupon {
	coupon: string
	date: Date
}

export interface UserOptions {
	futures: {
		enabled: boolean
	}
	spot: {
		enabled: boolean
	}
}

export interface DojibarSessionData extends Scenes.WizardSession<ConfigWizardSessionData> {
	__language_code: string // telegraf-i18n middleware
	__scenes: any // telegraf scenes/wizards

	chatId: number
	firstName: string
	key: BinanceKey
	shardId: number

	subscription: DojibarSubscription | null
	coupons: Array<UsedCoupon> | null

	options?: UserOptions
}

export interface DojibarContext extends Context {
	session: DojibarSessionData
	scene: Scenes.SceneContextScene<DojibarContext, ConfigWizardSessionData>
	wizard: Scenes.WizardContextWizard<DojibarContext>

	i18n: any // telegraf-i18n middleware
}

export interface UserSession extends Mongodb.WithId<Mongodb.Document> {
	_id: Mongodb.ObjectId
	key: string
	data: DojibarSessionData
}

export type ListenerCommand =
	{
		type: "START" | "STOP" | "RESTART"
		userId: number
	}
