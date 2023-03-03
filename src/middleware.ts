import { BinanceMerch, BinancePayHeaders } from 'bmerch'
import { Request, Response, NextFunction } from 'express'

// check if a request comes from Binance
export async function binanceWebhookCheck(merch: BinanceMerch, req: Request, res: Response, next: NextFunction) {
	const valid = await merch.isValidWebhookRequest(req.headers as BinancePayHeaders, req.body)
	if (!valid) {
		console.error("Invalid Binance Pay webhook")
		res.status(500).send({ "returnCode": "FAIL", "returnMessage": "Invalid signature" })
		return
	}
	next()
}