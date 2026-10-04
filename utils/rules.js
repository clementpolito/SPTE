const data = {
	badWord: [
		'etes vous',
		'ets',
		'fdp',
		'font-size',
		'melle',
		'n4est',
		'plug-in',
		'plug-ins',
		'responsif',
		's4est',
		'plugin',
		'greffon',
		'uploader',
		'downloader',
		'customiser',
		'updater',
		'mr',
		'sidebar',
		'shortcode',
		'tooltip',
		'breadcrumb',
		'changelog',
		'thumbnail',
		'addon',
		'add-on',
		'back-end',
		'front-end',
		'capabilities',
		'entête',
		'et/ou',
		'customizer',
		'template',
		'templates',
		'add-ons',
		'événement',
	],
	slash: '/',
	openHook: '[',
	openParenthesis: '(',
	openBrace: '{',
	ellipsis: '…',
	period: '.',
	comma: ',',
	closeHook: ']',
	closeParenthesis: ')',
	closeBrace: '}',
	exclamationPoint: '!',
	plusSign: '+',
	questionMark: '?',
	colon: ':',
	semiColon: ';',
	closingFrQuote: '»',
	openFrQuote: '«',
	fileExtensions: [
		'avi', 'bak', 'bat', 'bin', 'bmp', 'css', 'csv', 'doc', 'docx', 'eot',
		'exe', 'gif', 'git', 'github', 'htaccess', 'html', 'ico', 'ics', 'jpg',
		'jpeg', 'js', 'log', 'maintenance', 'mail', 'mo', 'mov', 'mp3', 'mp4',
		'mpeg', 'pdf', 'pem', 'php', 'po', 'pot', 'png', 'ppt', 'psd', 'ods',
		'rar', 'rtf', 'svg', 'sql', 'tar', 'gz', 'tiff', 'tif', 'ttf', 'txt',
		'vcf', 'wav', 'woff', 'xls', 'xlsx', 'xml', 'zip',
	],
};

/**
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
	return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/gm, '\\$&');
}

// Le guide du traducteur WP FR distingue 2 espaces insécables : U+00A0 (normale, devant
// ":"/"»") et U+202F (fine, devant "; ! ?").
// https://fr.wordpress.org/team/handbook/guide-du-traducteur/les-regles-typographiques-utilisees-pour-la-traduction-de-wp-en-francais/
export const NBSP = '\u00a0';
const NNBSP = '\u202f';
const nbspAny = `(?:${NBSP}|${NNBSP})`;

const fileExtensions = data.fileExtensions.join('|');

// Contexte partagé par rgxColon/rgxComma : exclut un caractère entouré d'un bloc `{{ }}`/`[[ ]]` (interpolation JS, ex: {{foo:bar}}). Voir issue #27.
const doubleBracketGuard = '(?:(?<=\\{\\{[a-zA-Z0-9:,]*)(?=[a-zA-Z0-9:,]*\\}\\})|(?<=\\[\\[[a-zA-Z0-9:,]*)(?=[a-zA-Z0-9:,]*\\]\\]))';

// Contexte partagé par rgxOpenParenthesis/rgxCloseParenthesis : exclut un appel de fonction façon WPCS
// (ex: registerBlockType( name, settings );), reconnu à sa parenthèse fermante suivie d'un point-virgule. Voir issue #8.
const wpcsFunctionCallGuard = '[^()]*\\)\\s*;';

// https://github.com/Association-WPFR/SPTE/wiki/rgxBadWords
export const rgxBadWords = new RegExp(`(?<=[\\s,:;"']|^)(?<!«\\s)${data.badWord.map(escapeRegExp).join('(?=[\\s,.:;"\']|$)|(?<=[\\s,:;"\']|^)(?<!«\\s)')}(?=[\\s,.:;"']|$)`, 'gmi');

// Mêmes exceptions pour l'apostrophe droite (U+0027) et l'apostrophe courbe inversée (U+2018) : attribut href, placeholder printf (%s).
/**
 * @param {string} quote
 * @returns {RegExp}
 */
function buildQuoteRegex(quote) {
	return new RegExp(`(?<!href\\=|href\\='[a-z0-9.]*?|%[a-z])${quote}(?!%[a-z])`, 'gm');
}

// https://github.com/Association-WPFR/SPTE/wiki/rgxSingleQuotes
export const rgxSingleQuotes = buildQuoteRegex('\u0027');

// L'apostrophe courbe inversée (U+2018) est à ne pas confondre avec U+2019 (la bonne, jamais signalée).
export const rgxReversedQuote = buildQuoteRegex('\u2018');

// Exclut les guillemets d'un attribut HTML (href="...", title="..."), puisque le texte traité
// peut contenir du HTML inline. https://github.com/Association-WPFR/SPTE/wiki/rgxDoubleQuotes
export const rgxDoubleQuotes = new RegExp('(?<!href\\=|href\\="[^"]*?|title\\=|title\\="[^"]*?)"', 'gm');

// https://github.com/Association-WPFR/SPTE/wiki/rgxSlash
export const rgxSlash = new RegExp(`(?<= |\u00a0)\\${data.slash}(?!\\${data.slash}|\\&gt\\;|\\}{2}|\\]{2})|(?<!\\${data.slash})\\${data.slash}(?= |\u00a0)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxOpenHook
export const rgxOpenHook = new RegExp(`(?<! |\\${data.openHook}|^)\\${data.openHook}(?!\\${data.openHook})|\\${data.openHook}(?=[ |\u00a0])`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxOpenParenthesis
export const rgxOpenParenthesis = new RegExp(`(?<![ ]|^|<br>|<br/>|<br />)\\${data.openParenthesis}(?!${wpcsFunctionCallGuard})(?!\\%|\\)|s\\)|x\\)|e\\)|es\\)|nt\\)|vent\\))|(?<!^)\\${data.openParenthesis}(?!${wpcsFunctionCallGuard})(?=[ | ])`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxOpenBrace
export const rgxOpenBrace = new RegExp(`(?<! |\\${data.openBrace}|^)\\${data.openBrace}(?!\\${data.openBrace})|\\${data.openBrace}(?=[ |\u00a0])(?![ \u00a0][a-zA-Z0-9]+\\${data.closeBrace})`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxEllipsis
export const rgxEllipsis = new RegExp(`(?<=[ |\u00a0])\\${data.ellipsis}|\\${data.ellipsis}(?=[a-zÀ-ú0-9]| $|\u00a0$)`, 'gmi');

// Trois points ASCII employés à la place du caractère points de suspension (U+2026). Règle distincte de
// rgxEllipsis, qui porte sur l'espacement : le message affiché doit désigner le caractère à utiliser. Voir issue #29.
export const rgxAsciiEllipsis = /\.\.\./gm;

// https://github.com/Association-WPFR/SPTE/wiki/rgxPeriod
// La 2e alternative (point collé entre 2 mots, ex: "mot.mot") ne se déclenche jamais : son lookbehind
// négatif matche toujours une chaîne vide. Comportement conservé tel quel, ne pas "corriger" sans test dédié.
export const rgxPeriod = new RegExp(`(?<= |\u00a0)\\${data.period}(?!${fileExtensions})|(?<![a-zÀ-ú0-9\\${data.period}]*?)\\${data.period}(?=[a-zÀ-ú0-9])|\\${data.period}( $|\u00a0$)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxComma
export const rgxComma = new RegExp(`(?<=[ |\u00a0])\\${data.comma}(?!${doubleBracketGuard})|\\${data.comma}(?!${doubleBracketGuard})(?=[a-zÀ-ú]| $|\u00a0$)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxCloseHook
export const rgxCloseHook = new RegExp(`(?<=[ |\u00a0])\\${data.closeHook}|(?<!\\${data.closeHook})\\${data.closeHook}(?=[a-zÀ-ú0-9]| $|\u00a0$)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxCloseParenthesis
export const rgxCloseParenthesis = new RegExp(`(?<= |\u00a0|\\([a-d]|\\([f-r]|\\([t-w]|\\([y-z])\\${data.closeParenthesis}(?!\\s*;)|\\${data.closeParenthesis}(?=[a-rt-zÀ-ú0-9]\u00a0$|\u00a0[a-zÀ-ú]{2,})`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxCloseBrace
export const rgxCloseBrace = new RegExp(`(?<=[ |\u00a0])\\${data.closeBrace}|(?<!\\${data.closeBrace})\\${data.closeBrace}(?=[a-zÀ-ú0-9]|\u00a0| $|\u00a0$)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxExclamationPoint
// Accepte U+00A0 ou U+202F comme insécable valide devant "!". La variante stricte
// (setting "espace fine insécable stricte") n'accepte que U+202F, la seule recommandée
// par le guide du traducteur pour "! ? ;".
function buildExclamationPointRegex(requiredNbsp) {
	return new RegExp(`(?<!${requiredNbsp}|^)\\${data.exclamationPoint}(?!important)|\\${data.exclamationPoint}(?!important)(?! |$|\\))`, 'gmi');
}
export const rgxExclamationPoint = buildExclamationPointRegex(nbspAny);
export const rgxExclamationPointStrict = buildExclamationPointRegex(NNBSP);

// https://github.com/Association-WPFR/SPTE/wiki/rgxPlusSign
export const rgxPlusSign = new RegExp(`(?<!\u00a0|google|^)\\${data.plusSign}|\\${data.plusSign}(?! |$)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxQuestionMark
function buildQuestionMarkRegex(requiredNbsp) {
	return new RegExp(`(?<!${requiredNbsp}|\\/|\\.php|\\/[a-z0-9\\-\\#\\.\\_]*?|^)\\${data.questionMark}|(?<!\\/|\\.php|\\/[a-z0-9\\-\\#\\.\\_]*?|^)\\${data.questionMark}(?! |$|\\))`, 'gmi');
}
export const rgxQuestionMark = buildQuestionMarkRegex(nbspAny);
export const rgxQuestionMarkStrict = buildQuestionMarkRegex(NNBSP);

// https://github.com/Association-WPFR/SPTE/wiki/rgxColon
// U+00A0 reste la seule espace recommandée devant ":" (pas de variante stricte ici).
export const rgxColon = new RegExp(`(?<!${nbspAny}|https|http| \\d{2}|\u00a0\\d{2}| hh|\u00a0hh| mm|\u00a0mm| aaaa|\u00a0aaaa|(?<![a-zA-Z])[gsiahymd])${data.colon}(?!${doubleBracketGuard})(?= )|(?<=${nbspAny})${data.colon}(?! |$)|(?<!${nbspAny}|https|http| \\d{2}|\u00a0\\d{2}| hh|\u00a0hh| mm|\u00a0mm| aaaa|\u00a0aaaa|(?<![a-zA-Z])[gsiahymd])${data.colon}(?!${doubleBracketGuard})(?! )`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxSemiColon
function buildSemiColonRegex(requiredNbsp) {
	return new RegExp(`(?<!${requiredNbsp}|:[a-z0-9.]*?|&[${data.semiColon}a-z0-9#]*?)${data.semiColon}(?!$)|(?<!:[a-z0-9.]*?|&[${data.semiColon}a-z0-9#]*?)${data.semiColon}(?! |$)`, 'gmi');
}
export const rgxSemiColon = buildSemiColonRegex(nbspAny);
export const rgxSemiColonStrict = buildSemiColonRegex(NNBSP);

// https://github.com/Association-WPFR/SPTE/wiki/rgxClosingFrQuote
// U+00A0 reste la seule espace recommandée devant "»" (pas de variante stricte ici).
export const rgxClosingFrQuote = new RegExp(`(?<!${nbspAny})${data.closingFrQuote}|${data.closingFrQuote}(?! |\\.|\\,|${nbspAny}\\?|${nbspAny}\\!|${nbspAny}\\:|${nbspAny}\\;|&lt;|$)`, 'gmi');

// https://github.com/Association-WPFR/SPTE/wiki/rgxOpenFrQuote
export const rgxOpenFrQuote = new RegExp(`(?<! |^|&gt;)${data.openFrQuote}|${data.openFrQuote}(?!\u00a0|$)`, 'gmi');

// Détecte un caractère de substitution (point, tiret, astérisque) à la place du vrai point
// médian U+00B7 (·) en écriture épicène. Valide uniquement le caractère utilisé quand
// l'écriture inclusive est déjà là ; ne détecte pas son absence (hors scope, volontaire).
export const rgxEpicenePunctuation = /(?<=[a-zÀ-ú])[.\-*](?:e|rice|trice|ve|euse|esse|ale|ère|enne|ienne|elle)(?:[.\-*]s)?(?=[\s,.;:!?)»]|$)/gm;

export const charTitle = 'Caractères à vérifier : ';
export const charClass = 'sp-warning--char';
const spaceBeforeTitle = 'Espace précédente manquante ou espace suivante en trop';
const spaceAfterTitle = 'Précédé par une espace ou caractère suivant collé ou suivi par une espace finale';
const nbkSpaceBeforeTitle = 'Non précédé par une espace insécable ou non suivi par une espace';
const nbkSpaceAfterTitle = 'Non précédé par une espace ou non suivi par une espace insécable';

// 'certain' (rouge) : erreur avérée. 'toVerify' (rose) : nécessite une relecture humaine,
// jamais de correction automatique. 'info' : simple indicateur visuel (espaces rendues
// visibles), ni une erreur ni une hypothèse à vérifier.
/** @typedef {'certain' | 'toVerify' | 'info'} RuleSeverity */

/**
 * @typedef {Object} TypographyRule
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {string} message
 * @property {RuleSeverity} severity
 * @property {string} cssClass
 * @property {number} counter
 * @property {RegExp} regex
 */

/** @type {TypographyRule[]} */
export const rules = [
	{
		id: 'badWords',
		name: '',
		title: 'Mots déconseillés ou mal orthographiés : ',
		message: 'Mot déconseillé ou mal orthographié',
		severity: 'certain',
		cssClass: 'sp-warning--word',
		counter: 0,
		regex: rgxBadWords,
	},
	{
		id: 'quotes',
		name: 'apostrophe droite',
		title: 'Apostrophes droites : ',
		message: 'Apostrophe droite au lieu d’une apostrophe courbe',
		severity: 'certain',
		cssClass: 'sp-warning--quote',
		counter: 0,
		regex: rgxSingleQuotes,
	},
	{
		id: 'reversedQuote',
		name: 'apostrophe courbe inversée',
		title: 'Apostrophes courbes inversées : ',
		message: 'Apostrophe courbe inversée au lieu d’une apostrophe courbe',
		severity: 'certain',
		cssClass: 'sp-warning--reversed-quote',
		counter: 0,
		regex: rgxReversedQuote,
	},
	{
		id: 'doubleQuotes',
		name: 'guillemet double droit',
		title: 'Guillemets doubles droits : ',
		message: 'Guillemet double droit au lieu des guillemets français « »',
		severity: 'certain',
		cssClass: 'sp-warning--quote',
		counter: 0,
		regex: rgxDoubleQuotes,
	},
	{
		id: 'slash',
		name: 'barre oblique',
		title: charTitle,
		message: 'Espace précédente en trop ou espace suivante en trop',
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxSlash,
	},
	{
		id: 'openHook',
		name: 'crochet ouvrant',
		title: charTitle,
		message: spaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxOpenHook,
	},
	{
		id: 'openParenthesis',
		name: 'parenthèse ouvrante',
		title: charTitle,
		message: spaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxOpenParenthesis,
	},
	{
		id: 'openBrace',
		name: 'accolade ouvrante',
		title: charTitle,
		message: spaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxOpenBrace,
	},
	{
		id: 'ellipsis',
		name: 'points de suspension',
		title: charTitle,
		message: spaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxEllipsis,
	},
	{
		id: 'asciiEllipsis',
		name: 'trois points',
		title: charTitle,
		message: 'Trois points au lieu du caractère points de suspension (…)',
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxAsciiEllipsis,
	},
	{
		id: 'period',
		name: 'point',
		title: charTitle,
		message: spaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxPeriod,
	},
	{
		id: 'comma',
		name: 'virgule',
		title: charTitle,
		message: spaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxComma,
	},
	{
		id: 'closeHook',
		name: 'crochet fermant',
		title: charTitle,
		message: spaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxCloseHook,
	},
	{
		id: 'closeParenthesis',
		name: 'parenthèse fermante',
		title: charTitle,
		message: spaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxCloseParenthesis,
	},
	{
		id: 'closeBrace',
		name: 'accolade fermante',
		title: charTitle,
		message: spaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxCloseBrace,
	},
	{
		id: 'exclamationPoint',
		name: 'point d’exclamation',
		title: charTitle,
		message: nbkSpaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxExclamationPoint,
	},
	{
		id: 'plusSign',
		name: 'signe plus',
		title: charTitle,
		message: nbkSpaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxPlusSign,
	},
	{
		id: 'questionMark',
		name: 'point d’interrogation',
		title: charTitle,
		message: nbkSpaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxQuestionMark,
	},
	{
		id: 'colon',
		name: 'deux points',
		title: charTitle,
		message: nbkSpaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxColon,
	},
	{
		id: 'semiColon',
		name: 'point-virgule',
		title: charTitle,
		message: nbkSpaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxSemiColon,
	},
	{
		id: 'closingFrQuote',
		name: 'guillemet français fermant',
		title: charTitle,
		message: nbkSpaceBeforeTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxClosingFrQuote,
	},
	{
		id: 'openFrQuote',
		name: 'guillemet français ouvrant',
		title: charTitle,
		message: nbkSpaceAfterTitle,
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxOpenFrQuote,
	},
	{
		id: 'epicenePunctuation',
		name: 'point médian mal formé',
		title: charTitle,
		message: 'Le point médian de l’écriture inclusive doit utiliser le caractère · (U+00B7), pas un point, un tiret ou un astérisque',
		severity: 'toVerify',
		cssClass: charClass,
		counter: 0,
		regex: rgxEpicenePunctuation,
	},
	{
		id: 'Space',
		name: 'espace sécable',
		title: '',
		message: 'Espace en début ou en fin de chaîne',
		severity: 'info',
		cssClass: 'sp-spaces--showing',
		counter: 0,
		regex: /^ | $| {2}/gm,
	},
	{
		id: 'nbkSpaces',
		name: 'espace insécable',
		title: '',
		message: 'Espace insécable',
		severity: 'info',
		cssClass: 'sp-nbkspaces--showing',
		counter: 0,
		regex: /[\u00A0\u202F]/gm,
	},
];
