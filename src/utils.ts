import B, { Binance } from 'binance-api-node'
import Big from 'big.js'
import * as datefns from "date-fns"
import { Message } from 'typegram'
import fr from 'date-fns/locale/fr/index.js'
import en from 'date-fns/locale/en-GB/index.js'
import es from 'date-fns/locale/es/index.js'
import de from 'date-fns/locale/de/index.js'
import { DojibarSessionData } from './types.js'


/**
 * Remove trailing zeros from number
 * @param s the string containing a number
 * @returns a string with trailing zeros removed
 */
export function removeTrailingZeros(s: string): string {
	return new Big(s).toString()
}

/**
 * Returns a Binance connection
 * @param apikey the api key
 * @param apisecret the secret key
 * @returns 
 */
export function getBinanceConnection(apikey?: string, apisecret?: string): Binance {
	if (!apikey || !apisecret) {
		throw new Error("Can't use apikey/apisecret because one of them is undefined")
	}
	//@ts-ignore
	return B.default({
		apiKey: apikey,
		apiSecret: apisecret
	})
}

/**
 * Check a message comes from an admin
 * @param message the text message to check
 * @returns true if the user who sent it is an admin
 */
export function isFromAdminUser(message: any): boolean {
	const id = message?.from?.id
	return id == parseInt(process.env.ADMIN_ID || "0") // it was a constant in the original version
}

export function escapeMD(message: string): string {
	for (let each of ['#', '+', '-', '=', '.', '!']) {
		message = message.replaceAll(each, '\\' + each)
	}
	return message
}

export function redMD(s: string): string {
	return '```' + s + '```'
}

export function getLocale(session: DojibarSessionData) {
	switch (session.__language_code) {
		case 'fr': return fr
		case 'en': return en
		case 'es': return es
		case 'de': return de
		default: return en
	}
}

/**
 * Returns true if session subscription doesn't exist or has expired
 */
export function expiredSession(session: DojibarSessionData) {
	if (!session.subscription?.validUntil) return true
	return datefns.isBefore(session.subscription?.validUntil, new Date())
}