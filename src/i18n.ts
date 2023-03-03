
import path from 'path'
import TelegrafI18n from 'telegraf-i18n'

export const i18n = new TelegrafI18n({
	defaultLanguage: 'en',
	allowMissing: true,
	defaultLanguageOnMissing: true,
	useSession: true,
	directory: path.resolve('./', 'locales')
})
