import { escapeRegExp } from './rules';

// Noms de marques et d'extensions cités tels quels dans les traductions, qu'il ne faut pas signaler comme des
// termes anglais non traduits (ex: « Search » dans « Google Search Console »). N'y ajouter qu'un nom qui contient
// un mot signalé par la règle des mots déconseillés (liste intégrée ou glossaire officiel) : les autres ne
// produisent aucun faux positif. Ne pas y ajouter un terme générique de WordPress (ex: « Custom Post Type »), ni
// un nom d'extension traduit en français (ex: « Classic Editor », « Éditeur classique »), qui doivent rester
// signalés. Chaque nom est vérifié par utils/product-names.test.js.
export const productNames = [
	// Marques
	'Google Analytics',
	'Google News',
	'Google Tag Manager',
	'Meta Business Suite',
	'Meta Pixel',
	'Search Console',

	// Extensions
	'Beaver Builder',
	'Better Search Replace',
	'Bricks Builder',
	'Contact Form 7',
	'Custom Post Type UI',
	'Divi Builder',
	'Easy Digital Downloads',
	'Formidable Forms',
	'Gravity Forms',
	'Ninja Forms',
	'Oxygen Builder',
	'Page Builder by SiteOrigin',
	'Post SMTP',
	'Query Monitor',
	'Search & Filter',
	'Smush',
	'User Role Editor',
	'WP Mail SMTP',
	'WPBakery Page Builder',
];

// Le texte analysé est du HTML (innerHTML) : « & » y apparaît sous la forme « &amp; ». Noms les plus longs en
// premier, pour reconnaître « Page Builder by SiteOrigin » plutôt qu'un nom plus court qu'il contiendrait.
const productNamesRegex = new RegExp(
	`(?<![a-zA-Z0-9À-ÿ])(?:${[...productNames]
		.sort((a, b) => b.length - a.length)
		.map((name) => escapeRegExp(name.replaceAll('&', '&amp;')))
		.join('|')})(?![a-zA-Z0-9À-ÿ])`,
	'gi',
);

/**
 * Indique si le passage [offset, offset + length[ du texte fait partie d'un nom de marque ou d'extension
 * présent dans ce même texte.
 * @param {string} text
 * @param {number} offset
 * @param {number} length
 * @returns {boolean}
 */
export function isInsideProductName(text, offset, length) {
	for (const match of text.matchAll(productNamesRegex)) {
		if (match.index <= offset && offset + length <= match.index + match[0].length) {
			return true;
		}
	}
	return false;
}
