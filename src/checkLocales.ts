import fs from 'fs'
const en = JSON.parse(fs.readFileSync('./locales/en.json').toString())
const fr = JSON.parse(fs.readFileSync('./locales/fr.json').toString())
const sp = JSON.parse(fs.readFileSync('./locales/sp.json').toString())
const de = JSON.parse(fs.readFileSync('./locales/de.json').toString())

for (let eachKey of Object.keys(en)) {
	if (!fr[eachKey]) {
		console.log(`FR "${eachKey}" is missing`)
	}

	// if (!sp[eachKey]) {
	// 	console.log(`SP "${eachKey}" is missing`)
	// }

	// if (!de[eachKey]) {
	// 	console.log(`DE "${eachKey}" is missing`)
	// }

}
