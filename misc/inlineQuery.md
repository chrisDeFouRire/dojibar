# To support inline query

It returns text, although it's an article result...

```

import { InlineQueryResultArticle, InputTextMessageContent } from 'telegraf/typings/core/types/typegram'

bot.inlineQuery("brag", (ctx) => {
	let res: InlineQueryResultArticle = {
		type: "article",
		id: "1",
		title: `you're the best ${ctx.from.first_name}`,
		description: `you've just made 666 USDT on your last trade`,
		input_message_content: {
			message_text: `"${ctx.from.first_name} is an incredible trader" says @DojiBarBot\nHe just bought back *BTCUSDT* at 38k that he paid 68k\nfor a hefty *666 USDT* profit`,
			parse_mode: "MarkdownV2"
		} as InputTextMessageContent
	}
	ctx.answerInlineQuery([res])
})
```