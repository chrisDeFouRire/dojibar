import { Markup } from 'telegraf';
import { i18n } from './i18n.js';
import * as actions from './actions.js';

// TODO I should use this in /subscription too

export function getSubscriptionButtons(lang: string) {
	const buttons = Markup.inlineKeyboard([
		Markup.button.callback("🗞" + i18n.t(lang, "subscribe"), actions.SUBSCRIBE_ACTION),
		Markup.button.callback("🆓" + i18n.t(lang, "redeem"), actions.REDEEM_ACTION)
	]);
	return buttons;
}
