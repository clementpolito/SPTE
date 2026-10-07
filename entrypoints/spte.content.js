import DOMPurify from 'dompurify';
import { rules, charTitle, charClass, NBSP, rgxExclamationPointStrict, rgxQuestionMarkStrict, rgxSemiColonStrict } from '../utils/rules';
import { addStyle, createElement, parseCsv, isPartOfProjectName, stripHighlightTags, isInsideHtmlTag } from '../utils/helpers';
import { buildWarningSpanHTML } from '../utils/warnings';
import { isInsideProductName } from '../utils/product-names';
import { createDefaultSettings } from '../utils/settings';
import {
	addForeignToolTip,
	addEditorHighlighter,
	hideNonWarningRows,
	showAllRows,
	moveFrenchRowToFirst,
	moveFrenchLocaleCardToFirst,
	setErrorRowsSelection,
} from '../utils/dom';
import './style.css';

// GlotDict plante s'il s'exécute après SPTE et trouve des balises qu'il n'attend pas : on force ses réglages pour les désactiver en amont.
// Les clés sont celles que lit gd_get_setting() dans GlotDict (préfixe gd_) : gd_curly_apostrophe_warning et gd_no_non_breaking_space.
// Issue #80 : sans elles, GlotDict surligne les traductions avant ou après SPTE et en déforme le texte.
// Effet de bord assumé : gd_curly_apostrophe_warning ne fait pas qu'éteindre le surlignage, il active aussi
// l'avertissement natif de GlotDict "straight single quote" (doublon avec la règle « apostrophe droite » de
// SPTE), et l'utilisateur ne peut pas le désactiver dans GlotDict puisque SPTE réécrit ce réglage à chaque
// chargement de page. Inoffensif (même diagnostic que SPTE), mais non demandé : aucun autre réglage GlotDict
// ne permet d'éteindre le seul surlignage sans ce doublon.
export function preventGlotDictTags() {
	localStorage.setItem('gd_curly_apostrophe_warning', 'true');
	localStorage.setItem('gd_no_non_breaking_space', 'true');
}

function tagTRTranslations(preview) {
	const hasTranslation = preview.classList.contains('has-translations');
	const trad = preview.querySelector('.translation-text');
	const spWarning = trad.querySelector('[class*="sp-warning--"]');
	if (hasTranslation && spWarning) {
		preview.classList.add('sp-has-spte-warning');
	}
	if (hasTranslation && (trad.querySelector('.sp-warning--word') || trad.querySelector('.sp-warning--quote') || trad.querySelector('.sp-warning--reversed-quote'))) {
		preview.classList.add('sp-has-spte-error');
	}
}

/** @param {ReturnType<typeof buildContext>} ctx */
export function updateWarningFilterState(ctx) {
	if (!ctx.showOnlyWarning || !ctx.showOnlyWarningLabel) { return; }
	const warningCount = document.querySelectorAll('tr.preview.sp-has-spte-warning').length;
	ctx.showOnlyWarningLabel.textContent = `Afficher uniquement les avertissements de cette page (${warningCount})`;
	ctx.showOnlyWarning.disabled = warningCount === 0;
	if (warningCount === 0) {
		ctx.showOnlyWarning.checked = false;
		ctx.lsShowOnlyWarning = false;
	}
}

/** @param {ReturnType<typeof buildContext>} ctx */
export function rowsDisplay(ctx) {
	updateWarningFilterState(ctx);
	// Les lignes du tableau d'historique de l'éditeur ne sont pas des traductions de la page : on ne les masque jamais.
	const rows = [...document.querySelectorAll('tr.preview:not(.sp-has-spte-warning)')].filter((row) => !row.closest('#translation-history-table'));
	if (ctx.lsShowOnlyWarning) {
		hideNonWarningRows(rows, Boolean(ctx.bulkActions));
	} else {
		showAllRows(rows);
	}
}

/**
 * Surligne dans `html` les passages que signalent les règles. `onMatch` est appelé à chaque passage retenu (avant son
 * surlignage) et peut renvoyer false pour ne pas le surligner (cas d'une traduction rejetée).
 * @param {ReturnType<typeof buildContext>} ctx
 * @param {string} html
 * @param {(rule: (typeof rules)[number]) => boolean | void} onMatch
 * @returns {string} HTML non assaini : les appelants le passent par DOMPurify avant de l'insérer
 */
function highlightRules(ctx, html, onMatch) {
	// GlotDict peut avoir déjà surligné la traduction (et SPTE lui-même en cas de second passage) : on repart du texte seul. Voir issue #80.
	let text = stripHighlightTags(html);

	// Pour la compatibilité des regex, on remplace les entités HTML d’espace insécable par le vrai caractère. NBSP est écrit avec
	// un échappement (\u00a0) : un caractère littéral se confond avec une espace normale et peut être normalisé sans que ça se voie (issue #79).
	text = text.replaceAll(/&nbsp;/gmi, NBSP);

	let textWithoutTags = text.replaceAll(/&lt;.*?(?<!\/)&gt;/gmi, '');
	for (const rule of rules) {
		text = text.replace(rule.regex, (string, ...replaceArgs) => {
			// String.prototype.replace() transmet un argument par groupe capturant avant la position et la chaîne
			// d'origine, puis un objet de groupes nommés le cas échéant (rgxPeriod contient un groupe capturant).
			// La position et la chaîne sont donc lues à partir de la fin de la liste des arguments.
			const positionalArgs = typeof replaceArgs.at(-1) === 'object' ? replaceArgs.slice(0, -1) : replaceArgs;
			const offset = /** @type {number} */ (positionalArgs.at(-2));
			const fullString = /** @type {string} */ (positionalArgs.at(-1));

			// Un rule précédent dans cette même passe peut avoir injecté un <span ...> (attributs entre
			// guillemets doubles) : ignorer tout match à l'intérieur de ce balisage déjà posé, sinon il est
			// corrompu par un second <span> imbriqué dans ses propres attributs.
			if (isInsideHtmlTag(fullString, offset)) {
				return string;
			}

			// Un match absent de textWithoutTags est à l'intérieur d'une balise, à ignorer. Suppose que
			// l'ordre de ce replace() et du textWithoutTags.replace(string, '') qui suit reste identique.
			if (!textWithoutTags.match(rule.regex)) {
				return string;
			}

			// Le mot fait partie du nom du projet (ex: une extension nommée "Widget") : pas un anglicisme à corriger. Voir issue #38.
			if (rule.id === 'badWords' && isPartOfProjectName(string, ctx.projectName)) {
				return string;
			}

			// Le mot fait partie d'un nom de marque ou d'extension cité dans la traduction (ex: « Search » dans « Google Search Console »).
			if (rule.id === 'badWords' && isInsideProductName(fullString, offset, string.length)) {
				return string;
			}

			if (onMatch(rule) === false) {
				return string;
			}
			textWithoutTags = textWithoutTags.replace(string, '');
			return buildWarningSpanHTML(rule, string);
		});
	}
	return text;
}

// Avec le statut « rejeté », on ne fait que décompter, pas de surlignage.
/** @param {ReturnType<typeof buildContext>} ctx */
export function checkTranslation(ctx, translation, oldStatus, newStatus) {
	const preview = translation.closest('tr.preview');

	addForeignToolTip(translation);

	// Inutile de traiter les anciennes traductions rejetées, sauf celle qu’on vient de rejeter, et uniquement pour les compteurs.
	if (!preview || (preview.classList.contains('status-rejected') && newStatus !== 'rejected')) { return; }

	const text = highlightRules(ctx, translation.innerHTML, (rule) => {
		// GlotPress a 6 statuts : untranslated, current, fuzzy, waiting, old, rejected. Old et rejected ne doivent pas être comptés.
		switch (newStatus) {
		case 'rejected':
			if (oldStatus !== 'old') {
				rule.counter--;
			}
			break;
		case 'fuzzy':
			if (oldStatus === 'rejected') {
				rule.counter++;
			}
			break;
		case 'current':
			if (oldStatus !== 'waiting') {
				rule.counter++;
			}
			break;
		case 'waiting':
			if (oldStatus !== 'current') {
				rule.counter++;
			}
			break;
		default:
			rule.counter++;
			break;
		}
		return newStatus !== 'rejected';
	});
	// Assainissement défensif : text mélange le HTML déjà rendu par GlotPress (translation.innerHTML)
	// et nos propres <span> de surlignage — DOMPurify neutralise tout contenu exécutable résiduel
	// sans toucher aux attributs qu'on utilise réellement (class, data-*, aria-*, tabindex).
	const node = document.createRange().createContextualFragment(DOMPurify.sanitize(text));
	const newTranslation = translation.cloneNode(false);
	newTranslation.append(node);
	translation.replaceWith(newTranslation);
	addEditorHighlighter(preview);
	tagTRTranslations(preview);
}

// La bulle (largeur 200px + marges) ne doit pas déborder de la fenêtre.
const TOOLTIP_HALF_WIDTH = 116;
// Hauteur minimale au-dessus de l'élément pour afficher la bulle dessus ; sinon elle passe dessous.
const TOOLTIP_MIN_SPACE_ABOVE = 100;

// Dans le tableau d'historique, la barre latérale de l'éditeur rogne la bulle personnalisée (position absolute) : on la passe en
// position fixed et on calcule ici ses coordonnées, bornées à la fenêtre, au survol ou au focus de l'avertissement.
/** @param {Element} warning */
export function positionHistoryTooltip(warning) {
	const rect = warning.getBoundingClientRect();
	const centerX = rect.left + (rect.width / 2);
	const maxX = Math.max(TOOLTIP_HALF_WIDTH, window.innerWidth - TOOLTIP_HALF_WIDTH);
	const above = rect.top >= TOOLTIP_MIN_SPACE_ABOVE;
	const style = /** @type {HTMLElement} */ (warning).style;
	style.setProperty('--sp-tip-x', `${Math.min(Math.max(centerX, TOOLTIP_HALF_WIDTH), maxX)}px`);
	style.setProperty('--sp-tip-ax', `${centerX}px`);
	style.setProperty('--sp-tip-y', `${above ? rect.top - 6 : rect.bottom + 6}px`);
	style.setProperty('--sp-tip-ty', above ? '-100%' : '0');
}

// Tableau d'historique de l'éditeur (#translation-history-table) : surlignage seul, sans compteurs ni filtres,
// puisque ces lignes (déjà comptées ou non selon leur statut) ne font pas partie des traductions de la page.
/** @param {ReturnType<typeof buildContext>} ctx */
export function highlightHistoryTable(ctx, table) {
	table.classList.add('sp-history--fixed-tooltip');
	if (!table.dataset.spTooltipBound) {
		table.dataset.spTooltipBound = 'true';
		const onEnter = (e) => {
			const warning = e.target.closest?.('[class*="sp-warning--"]');
			if (warning) { positionHistoryTooltip(warning); }
		};
		table.addEventListener('mouseover', onEnter);
		table.addEventListener('focusin', onEnter);
	}
	for (const link of table.querySelectorAll('tbody tr td:nth-child(2) a')) {
		const highlighted = highlightRules(ctx, link.innerHTML, () => true);
		link.replaceChildren(document.createRange().createContextualFragment(DOMPurify.sanitize(highlighted)));
	}
}

/** @param {ReturnType<typeof buildContext>} ctx */
function toggleCaption(ctx, e) {
	ctx.lsHideCaption = ctx.lsHideCaption !== true;
	ctx.resultsCaption.classList.toggle('sp-results__captions--closed');
	e.target.textContent = (e.target.textContent === 'Masquer la légende') ? 'Afficher la légende' : 'Masquer la légende';
	localStorage.setItem('spteHideCaption', ((ctx.lsHideCaption === true) ? 'true' : 'false'));
	e.preventDefault();
}

// Défilement + focus sur la première occurrence (accessibilité). Voir issue #3.
/** @param {string} cssClass */
function jumpToFirstWarning(cssClass) {
	// Exclut le compteur lui-même (même classe que ce qu'il cherche, ex: sp-warning--word) : sinon
	// il se trouverait en premier puisqu'il précède le tableau dans le DOM (en-tête).
	const target = /** @type {HTMLElement | null} */ (document.querySelector(`.${cssClass}:not(.sp-warning-title)`));
	if (!target) { return; }
	target.scrollIntoView({ behavior: 'smooth', block: 'center' });
	target.focus();
}

// C'est un <button>, pas un lien : il ne navigue nulle part, il déplace juste le focus sur la page actuelle.
/**
 * @param {Element} counter
 * @param {string} cssClass
 * @param {string} label
 */
function makeCounterClickable(counter, cssClass, label) {
	counter.setAttribute('aria-label', `Aller à la première occurrence : ${label}`);
	counter.classList.add('sp-warning-title--clickable');
	counter.addEventListener('click', () => jumpToFirstWarning(cssClass));
}

/** @param {ReturnType<typeof buildContext>} ctx */
function displayResults(ctx) {
	let nbCharacter = 0;
	let nbTotal = 0;

	for (const rule of rules) {
		if (!rule.counter) {
			continue;
		}

		if (rule.title && rule.title !== charTitle) {
			let counter = document.querySelector(`.${rule.cssClass}.sp-warning-title`);
			if (counter) {
				// Deux règles peuvent partager le même cssClass (ex: quotes/doubleQuotes) : on cumule plutôt que d'écraser.
				counter.textContent = String(Number(counter.textContent) + rule.counter);
			} else {
				const title = createElement('SPAN', {}, rule.title);
				counter = createElement('BUTTON', { type: 'button', class: `${rule.cssClass} sp-warning-title` }, String(rule.counter));
				makeCounterClickable(counter, rule.cssClass, rule.title);
				title.append(counter);
				ctx.resultsData.append(title);
			}
			nbTotal += rule.counter;
		} else if (rule.title === charTitle) {
			nbCharacter += rule.counter;
			nbTotal += rule.counter;
		}
	}

	let counter = document.querySelector(`.${charClass}.sp-warning-title`);
	if (counter) {
		counter.textContent = String(nbCharacter);
	} else if (nbCharacter) {
		counter = createElement('BUTTON', { type: 'button', class: `${charClass} sp-warning-title` }, String(nbCharacter));
		makeCounterClickable(counter, charClass, charTitle.replace(/\s*:\s*$/, ''));
		ctx.title.append(counter);
		ctx.resultsData.append(ctx.title);
	}

	ctx.resultsTitle.textContent = nbTotal ? `éléments à vérifier : ${nbTotal}` : 'aucun élément à vérifier';
	ctx.resultsTitle.classList.add('sp-results__title');
	ctx.resultsTitle.classList.toggle('sp-results__title--ok', nbTotal === 0);
	ctx.filterToolbar.append(ctx.results);

	if (nbTotal) {
		if (ctx.lsHideCaption) {
			ctx.hideCaption.textContent = 'Afficher la légende';
			ctx.resultsCaption.classList.add('sp-results__captions--closed');
		} else {
			ctx.hideCaption.textContent = 'Masquer la légende';
		}
		ctx.hideCaption.onclick = (e) => toggleCaption(ctx, e);
		ctx.resultsCaption.append(ctx.hideCaption, ctx.caption, ctx.glossaryLink, ctx.typographyLink);
	} else {
		ctx.resultsCaption.replaceChildren();
	}
	const characters = document.querySelector('.sp-warning-title.sp-warning--char');
	if (nbCharacter === 0 && characters?.parentElement) {
		characters.parentElement.remove();
	}
	const quotes = document.querySelector('.sp-warning-title.sp-warning--quote');
	if (ctx.rulesById.get('quotes').counter === 0 && ctx.rulesById.get('doubleQuotes').counter === 0 && quotes?.parentElement) {
		quotes.parentElement.remove();
	}
	const reversedQuotes = document.querySelector('.sp-warning-title.sp-warning--reversed-quote');
	if (ctx.rulesById.get('reversedQuote').counter === 0 && reversedQuotes?.parentElement) {
		reversedQuotes.parentElement.remove();
	}
}

/** @param {ReturnType<typeof buildContext>} ctx */
function manageControls(ctx) {
	if (!ctx.showOnlyWarning) { return; }

	ctx.showOnlyWarning.addEventListener('change', () => {
		localStorage.setItem('spteShowOnlyWarning', ctx.showOnlyWarning.checked ? 'true' : 'false');
		ctx.lsShowOnlyWarning = ctx.showOnlyWarning.checked;
		rowsDisplay(ctx);
	});

	if (!ctx.spSelectErrors) { return; }

	ctx.spSelectErrors.addEventListener('change', () => {
		const errorRows = document.querySelectorAll('tr.preview.sp-has-spte-error');
		const nbSelectedRows = setErrorRowsSelection(errorRows, ctx.spSelectErrors.checked);
		if (document.querySelector('#gd-checked-count')) {
			document.querySelector('#gd-checked-count').remove();
		}
		if (nbSelectedRows === 0) { return; }
		const GDCountNotice = createElement('DIV', { id: 'gd-checked-count', class: 'notice' }, `${nbSelectedRows} ligne(s) sélectionnée(s)`);
		ctx.tableTranslations.parentNode.insertBefore(GDCountNotice, ctx.tableTranslations);
	});
}

// Page de présentation d'un projet (liste des locales) uniquement.
/** @param {ReturnType<typeof buildContext>} ctx */
function frenchiesGoFirst(ctx) {
	moveFrenchRowToFirst(ctx.frenchStatsGlobal, ctx.GDmayBeOnBoard);
	// Pas de garde GlotDict ici : GlotDict n'a aucune emprise sur cette page
	// (contrairement au tableau des locales d'un projet, où son réordonnancement peut entrer en conflit avec le nôtre).
	moveFrenchLocaleCardToFirst(ctx.frenchLocaleCard, false);
}

/** @param {ReturnType<typeof buildContext>} ctx */
export function frenchFlag(ctx, spteFrenchFlag) {
	if (spteFrenchFlag && spteFrenchFlag === 'false') { return; }

	if (ctx.frenchStatsSpecific) {
		ctx.frenchStatsSpecific.classList.add('sp-frenchies', 'sp-frenchies--long');
	}
	if (ctx.frenchStatsGlobal) {
		ctx.frenchStatsGlobal.classList.add('sp-frenchies');
	}
	if (ctx.frenchLocaleCard) {
		ctx.frenchLocaleCard.classList.add('sp-frenchies', 'sp-frenchies--locale-card');
	}
}

// L'éditeur charge le tableau d'historique en AJAX à chaque ouverture : on le surligne dès qu'il apparaît.
/** @param {ReturnType<typeof buildContext>} ctx */
function observeHistory(ctx) {
	const highlightIfHistory = (node) => {
		if (node.nodeType !== 1) { return; }
		const table = node.id === 'translation-history-table' ? node : node.querySelector('#translation-history-table');
		if (table) { highlightHistoryTable(ctx, table); }
	};
	document.querySelectorAll('#translation-history-table').forEach((table) => highlightHistoryTable(ctx, table));
	new MutationObserver((mutations) => {
		mutations.forEach((mutation) => mutation.addedNodes.forEach(highlightIfHistory));
	}).observe(ctx.gpContent, { subtree: true, childList: true });
}

/** @param {ReturnType<typeof buildContext>} ctx */
function observeMutations(ctx) {
	const observerMutations = new MutationObserver((mutations) => {
		/** @type {string | undefined} */
		let removedRowID;
		/** @type {string | undefined} */
		let addedRowID;
		/** @type {string | undefined} */
		let oldStatus;
		/** @type {string | undefined} */
		let newStatus;
		let translation;
		mutations.forEach((mutation) => {
			mutation.removedNodes.forEach((node) => {
				if (node.nodeType !== 1) { return; }
				const removedNode = /** @type {Element} */ (node);
				if (!removedRowID && !oldStatus && removedNode.nodeName === 'TR' && removedNode.classList.contains('preview')) {
					removedRowID = removedNode.id;
					if (removedNode.classList.contains('untranslated')) {
						oldStatus = 'untranslated';
					} else {
						oldStatus = removedNode.classList.value.match('(?<=status-)(\\w*)(?= )')?.[0];
					}
				}
			});

			mutation.addedNodes.forEach((node) => {
				if (node.nodeType !== 1) {	return;	}
				const addedNode = /** @type {Element} */ (node);

				// Lignes correspondant à des changements de statut.
				if (!addedRowID && !newStatus && addedNode.nodeName === 'TR' && addedNode.classList.contains('preview')) {
					addedRowID = addedNode.id;
					newStatus = addedNode.classList.value.match('(?<=status-)(\\w*)(?= )')?.[0];
				}

				// Notices de GlotDict : si le parent doit changer, on vérifie que addedNode n’a pas déjà été ajouté au parent.
				if (ctx.GDmayBeOnBoard && addedNode.parentNode !== ctx.spGDNoticesContainer && addedNode.id.startsWith('gd-') && addedNode.classList.contains('notice')) {
					ctx.spGDNoticesContainer.appendChild(addedNode);
				}
			});
		});

		if (removedRowID && addedRowID && oldStatus && newStatus) {
			if (oldStatus === 'untranslated' && !addedRowID.toString().startsWith(removedRowID.replace('old', ''))) { return; }
			if (oldStatus !== 'untranslated' && !removedRowID.toString().startsWith(addedRowID)) { return; }

			translation = document.querySelector(`#${addedRowID} .translation-text`);
			checkTranslation(ctx, translation, oldStatus, newStatus);
			displayResults(ctx);
			manageControls(ctx);
			updateWarningFilterState(ctx);
		}
	});

	observerMutations.observe(ctx.gpContent, {
		subtree: true,
		childList: true,
	});
}

// Place tous les éléments dans un en-tête collant (sticky).
/** @param {ReturnType<typeof buildContext>} ctx */
function buildHeader(ctx) {
	if (ctx.bulkActions) {
		ctx.spControls.append(ctx.pteControls);
	}
	ctx.spControls.append(ctx.spFilters, ctx.spConsistency);
	ctx.filterToolbar.append(ctx.spGDNoticesContainer, ctx.spControls);
}

/** @param {ReturnType<typeof buildContext>} ctx */
function checkConsistency(ctx) {
	const inputValue = ctx.spConsistencyInputText.value;
	if (inputValue === '') { return; }
	ctx.popupTriggerElement = /** @type {HTMLElement} */ (document.activeElement);
	ctx.spPopup.classList.remove('sp-the-popup--hidden');
	ctx.spPopup.innerHTML = '<span class="suggestions__loading-indicator__icon"><span></span><span></span><span></span></span>';
	const URL = `https://translate.wordpress.org/consistency/?search=${encodeURIComponent(inputValue)}&set=${ctx.currentProjectLocaleSlug}%2Fdefault&`;
	fetch(URL).then((response) => response.text()).then((data) => {
		const table = data.replace(/(\r\n|\n|\r)/gm, '').match(/(?<=consistency-table">)(.*?)(?=<\/table>)/gmi);
		if (table && table[0]) {
			// table[0] vient d'une réponse réseau (translate.wordpress.org) : jamais injecté tel quel.
			ctx.spPopup.innerHTML = DOMPurify.sanitize(`<table class="consistency">${table[0]}</table>`);
		} else {
			ctx.spPopup.innerHTML = '<h1 style="text-align:center;margin:2em auto;">Aucun résultat</h1>';
		}
		ctx.spPopup.focus();
	});
}

/** @param {ReturnType<typeof buildContext>} ctx */
function closePopup(ctx, e) {
	if (!ctx.spPopup.contains(e.target) && e.target !== ctx.spConsistencyBtn) {
		ctx.spPopup.innerHTML = '';
		ctx.spPopup.classList.add('sp-the-popup--hidden');
		ctx.spConsistencyInputText.value = '';
		if (ctx.popupTriggerElement) {
			ctx.popupTriggerElement.focus();
			ctx.popupTriggerElement = null;
		}
	}
}

/** @param {ReturnType<typeof buildContext>} ctx */
function declareEvents(ctx) {
	document.addEventListener('click', (e) => {
		closePopup(ctx, e);
	});

	document.addEventListener('keyup', (e) => {
		switch (e.key) {
		case 'Escape':
			closePopup(ctx, e);
			break;

		default:
			break;
		}
	});

	ctx.spConsistencyInputText.addEventListener('keyup', (e) => {
		e.preventDefault();
		switch (e.key) {
		case 'Enter':
			checkConsistency(ctx);
			break;

		default:
			break;
		}
	});

	ctx.spConsistencyBtn.addEventListener('click', (e) => {
		e.preventDefault();
		checkConsistency(ctx);
	});
}

function setColors(spteColorWord, spteColorQuote, spteColorChar) {
	spteColorWord ||= '#ff0000';
	spteColorQuote ||= '#ff0000';
	spteColorChar ||= '#ff00ff';
	addStyle('.sp-warning--word', `background-color:${spteColorWord};color:white;font-weight:bold;padding:1px;margin:0 1px`);
	addStyle('.sp-warning--quote, .sp-warning--reversed-quote', `display:inline-block;line-height:16px;box-shadow:${spteColorQuote} 0px 0px 0px 2px inset;background-color:white;padding:3px 4px`);
	addStyle('.sp-warning--char', `display:inline-block;line-height:16px;box-shadow:${spteColorChar} 0px 0px 0px 2px inset;background-color:white;padding:3px 4px`);
	addStyle('.sp-spaces--showing', 'display:inline-block;line-height:16px;background-color:deepskyblue;border:2px solid deepskyblue');
	addStyle('.sp-nbkspaces--showing', 'display:inline-block;line-height:16px;background-color:white;border:2px solid white');
}

function blackToolTip(spteBlackToolTip) {
	if (spteBlackToolTip && spteBlackToolTip === 'false') {
		addStyle('.actions:hover .sp-foreign-tooltip', 'display:none!important');
		addStyle('.actions:hover', 'cursor:pointer!important');
	}
}

/** @param {ReturnType<typeof buildContext>} ctx */
export function gpContentMaxWidth(ctx, spteEnlargeTable, spteGpcontentBig) {
	const enlargeTable = spteEnlargeTable !== 'false';
	const enlargeRest = spteGpcontentBig === 'true';

	if ((ctx.tableTranslations && enlargeTable) || (!ctx.tableTranslations && enlargeRest)) {
		addStyle('.gp-content', 'max-width: 85% !important');
	}
}

/**
 * Termes du glossaire officiel dont la traduction française diffère systématiquement du terme anglais
 * (donc à signaler s'ils apparaissent tels quels, non traduits, dans une traduction). Un terme polysémique
 * (ex. « note » nom / « noter » verbe) a 2 entrées glossaire pour le même « en » : si l'une des deux a une
 * traduction identique, le terme est ambigu et n'est jamais signalé, plutôt que de risquer un faux positif.
 * Voir issue #63.
 * @param {string[][]} entries lignes du CSV glossaire (hors en-tête), déjà filtrées des lignes SPTE/[np]
 * @param {number} enIndex
 * @param {number} frIndex
 * @returns {string[]}
 */
export function getUnambiguousGlossaryTerms(entries, enIndex, frIndex) {
	// true : au moins une entrée avec une traduction différente. false : toutes les entrées vues jusqu'ici
	// ont une traduction identique (terme ambigu dès qu'une seule diffère, cf. commentaire ci-dessus).
	const termTranslationDiffers = new Map();
	entries.forEach((row) => {
		const en = (row[enIndex] || '').trim().toLowerCase();
		const fr = (row[frIndex] || '').trim().toLowerCase();
		if (en === '' || fr === '') { return; }
		if (en === fr) {
			termTranslationDiffers.set(en, false);
		} else if (!termTranslationDiffers.has(en)) {
			termTranslationDiffers.set(en, true);
		}
	});
	return [...termTranslationDiffers].filter(([, differs]) => differs).map(([term]) => term);
}

/** @param {ReturnType<typeof buildContext>} ctx */
export function getGlossaryRegex(ctx, glossary) {
	const badWordsRegexPattern = ctx.rulesById.get('badWords').regex.source;
	// On duplique chaque mot avec un s final pour pouvoir traiter les pluriels.
	const glossaryWithPlurals = glossary.reduce((a, i) => a.concat(i, `${i}s`), []);
	const glossaryRegexPattern = `${glossaryWithPlurals.join('(?=[\\s,:;"\']|$)|(?<=[\\s,:;"\']|^)(?<!«\\s)')}(?=[\\s,.:;"']|$)`;
	// Flag « i » indispensable : les termes du glossaire sont en minuscules (et rgxBadWords l'a déjà), sinon un mot capitalisé n'est pas repéré.
	const newRgxBadWords = new RegExp(`${badWordsRegexPattern}|${glossaryRegexPattern}`, 'gmi');
	ctx.rulesById.get('badWords').regex = newRgxBadWords;
}

/** @param {ReturnType<typeof buildContext>} ctx */
export function applyStrictNarrowSpace(ctx, enabled) {
	if (!enabled) { return; }
	ctx.rulesById.get('exclamationPoint').regex = rgxExclamationPointStrict;
	ctx.rulesById.get('questionMark').regex = rgxQuestionMarkStrict;
	ctx.rulesById.get('semiColon').regex = rgxSemiColonStrict;
}

/** @param {ReturnType<typeof buildContext>} ctx */
function mainProcesses(ctx, spteSettings) {
	document.body.appendChild(ctx.spPopup);
	applyStrictNarrowSpace(ctx, spteSettings.spteStrictNarrowSpace === 'true');
	gpContentMaxWidth(ctx, spteSettings.spteEnlargeTable, spteSettings.spteGpcontentBig);
	if (spteSettings.spteBetterReadability && spteSettings.spteBetterReadability === 'true') { document.body.classList.add('sp-better-readability'); }

	const onFrenchLocale = (/\/fr\//).test(window.location.href);

	if (onFrenchLocale && ctx.gpContent && ctx.tableTranslations) {
		setColors(spteSettings.spteColorWord, spteSettings.spteColorQuote, spteSettings.spteColorChar);
		preventGlotDictTags();
		ctx.translations.forEach((translation) => checkTranslation(ctx, translation));
		rowsDisplay(ctx);

		blackToolTip(spteSettings.spteBlackToolTip);
		displayResults(ctx);
		manageControls(ctx);
		buildHeader(ctx);
		observeHistory(ctx);
		if (ctx.isConnected) {
			observeMutations(ctx);
		}
		declareEvents(ctx);
	}

	if (ctx.onTranslateWordPressRoot && (ctx.frenchStatsGlobal || ctx.frenchLocaleCard)) {
		frenchiesGoFirst(ctx);
	}
	frenchFlag(ctx, spteSettings.spteFrenchFlag);
}

/** @param {ReturnType<typeof buildContext>} ctx */
function launchProcess(ctx, spteSettings) {
	const hasExistingSettings = spteSettings !== undefined;
	spteSettings = spteSettings || {};
	const todayDate = new Date();
	if (spteSettings.spteActiveGlossary === 'false') {
		mainProcesses(ctx, spteSettings);
		return;
	}
	if (spteSettings.spteLastUpdateGlossary !== '' && spteSettings.spteGlossary !== '' && todayDate.toISOString().substring(0, 10) === spteSettings.spteLastUpdateGlossary) {
		getGlossaryRegex(ctx, spteSettings.spteGlossary);
		mainProcesses(ctx, spteSettings);
	} else {
		fetch(ctx.glossaryExportURL).then((response) => response.text()).then((dataGlossary) => {
			const rows = parseCsv(dataGlossary);
			const header = rows[0];
			const enIndex = header ? header.indexOf('en') : -1;
			const frIndex = header ? header.indexOf('fr') : -1;
			if (enIndex !== -1 && frIndex !== -1) {
				const entries = rows.slice(1)
					.filter((row) => !row.some((field) => field.toLowerCase().includes('spte') || field.toLowerCase().includes('[np]')));

				const difference = getUnambiguousGlossaryTerms(entries, enIndex, frIndex);

				getGlossaryRegex(ctx, difference);

				mainProcesses(ctx, spteSettings);

				let settings;
				if (hasExistingSettings) {
					settings = spteSettings;
					settings.spteLastUpdateGlossary = todayDate.toISOString().substring(0, 10);
					settings.spteGlossary = difference;
					settings.spteActiveGlossary = 'true';
				} else {
					settings = createDefaultSettings({
						spteLastUpdateGlossary: todayDate.toISOString().substring(0, 10),
						spteGlossary: difference,
					});
				}

				browser.storage.local.set({ spteSettings: settings }).catch(() => {
					console.log('Impossible d’initialiser les paramètres');
				});
			} else {
				console.log('Glossaire officiel : format inattendu, SPTE continue sans le glossaire à jour.');
				mainProcesses(ctx, spteSettings);
			}
		}).catch(() => {
			// Sans ce filet, mainProcesses() n'est jamais appelé et SPTE semble inactif, sans indice.
			console.log('Glossaire officiel : téléchargement impossible, SPTE continue sans le glossaire à jour.');
			mainProcesses(ctx, spteSettings);
		});
	}
}

function buildContext() {
	const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
	const onTranslateWordPressRoot = (/https:\/\/translate\.wordpress\.org\//).test(window.location.href);

	// Slug de locale dérivé de l'URL (validé par pattern pour éviter un segment sans rapport, ex: 'wp-plugins'), repli sur 'fr' sinon.
	let currentProjectLocaleSlug = '';
	const pathSegments = window.location.pathname.split('/').filter(Boolean);
	const localeSlugPattern = /^[a-z]{2,3}(-[a-z0-9]{2,6})?$/;
	if (pathSegments.length >= 2 && localeSlugPattern.test(pathSegments[pathSegments.length - 2])) {
		currentProjectLocaleSlug = pathSegments[pathSegments.length - 2];
	}
	currentProjectLocaleSlug = (currentProjectLocaleSlug === '') ? 'fr' : currentProjectLocaleSlug;

	const typographyURL = 'https://fr.wordpress.org/team/handbook/guide-du-traducteur/les-regles-typographiques-utilisees-pour-la-traduction-de-wp-en-francais/';
	const glossaryURL = `https://translate.wordpress.org/locale/${currentProjectLocaleSlug}/default/glossary/`;
	// Export CSV officiel du glossaire (colonnes en,fr,pos,description).
	const glossaryExportURL = `${glossaryURL}-export/`;

	// Réglages (localStorage ne gère pas les booléens).
	const lsHideCaption = localStorage.getItem('spteHideCaption') === 'true';
	const lsShowOnlyWarning = localStorage.getItem('spteShowOnlyWarning') === 'true';

	const gpContent = /** @type {HTMLElement | null} */ (document.querySelector('.gp-content'));
	if (gpContent) { gpContent.style.maxWidth = '85% !important'; }
	const translations = document.querySelectorAll('tr.preview:not(.sp-has-spte-error) .translation-text');
	const bulkActions = document.querySelector('#bulk-actions-toolbar-top');
	if (bulkActions) {
		document.body.classList.add('sp-pte-is-on-board');
	}
	const tableTranslations = document.querySelector('#translations');
	const filterToolbar = document.querySelector('.filter-toolbar');
	const isConnected = document.querySelector('body.logged-in') !== null;
	const GDmayBeOnBoard = localStorage.getItem('gd_language') !== null;

	// Nom du projet (breadcrumb), pour ne pas signaler à tort son propre nom dans badWords (ex: une extension nommée "Widget"). Voir issue #38.
	const projectName = document.querySelector('.breadcrumb li:nth-child(3) a')?.textContent?.trim() ?? '';

	const spPopup = createElement('DIV', { id: 'sp-the-popup', class: 'sp-the-popup--hidden', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Résultats de cohérence', tabindex: '-1' });
	const spGDNoticesContainer = createElement('DIV', { id: 'sp-gd-notices-container' });
	const spConsistency = createElement('DIV', { id: 'sp-consist-container' });
	const spConsistencyLabel = createElement('LABEL', { for: 'sp-consist__text' }, 'Cohérence d’une chaîne');
	const spConsistencyInputText = /** @type {HTMLInputElement} */ (createElement('INPUT', { type: 'text', id: 'sp-consist__text', name: 'spConsistencyInputText', value: '' }));
	const spConsistencyBtn = createElement('INPUT', { type: 'button', id: 'sp-consist__btn', name: 'spConsistencyBtn', value: 'Vérifier' });
	spConsistency.append(spConsistencyLabel, spConsistencyInputText, spConsistencyBtn);
	const spControls = createElement('DIV', { id: 'sp-controls' });
	const results = createElement('DIV', { id: 'sp-results', class: 'sp-results' });
	const resultsData = createElement('DIV', { class: 'sp-results__data' });
	const resultsCaption = createElement('DIV', { class: 'sp-results__captions' });
	const resultsTitle = createElement('P');
	results.append(resultsData, resultsCaption);
	resultsData.append(resultsTitle);
	const title = createElement('SPAN', {}, charTitle);
	const caption = createElement('P', { class: 'sp-results__caption' });
	caption.innerHTML = 'Les avertissements en rouge sont à <strong class="sp-info" title="Quelques rares exceptions subsistent, par exemple lorsque le mot fait partie du nom de l’extension">très forte probabilité</strong>. Ceux en rose sont à <strong class="sp-info" title="Les exceptions sont fréquentes lorsque du code est intégré aux traductions (fonctions, paramètres…)">forte probabilité</strong> mais à vérifier car ils peuvent compter des faux positifs.';
	const typographyLink = createElement('P', { class: 'sp-results__caption sp-results__caption--link' });
	const typographyAnchor = createElement('A', { class: 'sp-caption-link sp-caption-link--typography', target: '_blank', rel: 'noopener', href: typographyURL }, 'les règles typographiques');
	typographyLink.append('Consultez ', typographyAnchor, ' à respecter pour les caractères.');
	const glossaryLink = createElement('P', { class: 'sp-results__caption sp-results__caption--link' });
	const glossaryAnchor = createElement('A', { class: 'sp-caption-link sp-caption-link--glossary', target: '_blank', rel: 'noopener', href: glossaryURL }, 'le glossaire officiel');
	glossaryLink.append('Consultez ', glossaryAnchor, ' à respecter pour les mots.');
	const hideCaption = createElement('BUTTON', { type: 'button', id: 'sp-results__toggle-caption', title: 'Légende' });
	const spFilters = createElement('DIV', { class: 'sp-controls__filters' });
	const showOnlyWarning = /** @type {HTMLInputElement} */ (createElement('INPUT', { type: 'checkbox', id: 'sp-show-only-warnings', name: 'showOnlyWarning', value: 'showOnlyWarning' }));
	const showOnlyWarningLabel = createElement('LABEL', { for: 'sp-show-only-warnings' }, 'Afficher uniquement les avertissements de cette page (0)');
	showOnlyWarning.checked = lsShowOnlyWarning;
	spFilters.append(showOnlyWarning, showOnlyWarningLabel);

	const pteControls = createElement('DIV', { class: 'sp-controls__pte' });
	const spSelectErrors = /** @type {HTMLInputElement} */ (createElement('INPUT', { type: 'checkbox', id: 'sp-select-errors', name: 'spteSelectErrors', value: 'spteSelectErrors' }));
	const spSelectErrorsLabel = createElement('LABEL', { for: 'sp-select-errors' }, 'Cocher les mots et apostrophes');
	if (bulkActions) {
		pteControls.append(spSelectErrors, spSelectErrorsLabel);
	}

	const frenchStatsGlobal = document.querySelector('#stats-table tr a[href*="/locale/fr/"]');
	const frenchLocaleCard = document.querySelector('#locales a[href*="/locale/fr/"]');
	const frenchStatsSpecific = document.querySelector('#translation-sets tr a[href*="/fr/"]');

	return {
		rulesById,
		onTranslateWordPressRoot,
		currentProjectLocaleSlug,
		popupTriggerElement: /** @type {HTMLElement | null} */ (null),
		typographyURL,
		glossaryURL,
		glossaryExportURL,
		lsHideCaption,
		lsShowOnlyWarning,
		gpContent,
		translations,
		bulkActions,
		tableTranslations,
		filterToolbar,
		isConnected,
		GDmayBeOnBoard,
		projectName,
		spPopup,
		spGDNoticesContainer,
		spConsistency,
		spConsistencyLabel,
		spConsistencyInputText,
		spConsistencyBtn,
		spControls,
		results,
		resultsData,
		resultsCaption,
		resultsTitle,
		title,
		caption,
		typographyLink,
		glossaryLink,
		hideCaption,
		spFilters,
		showOnlyWarning,
		showOnlyWarningLabel,
		pteControls,
		spSelectErrors,
		spSelectErrorsLabel,
		frenchStatsGlobal,
		frenchLocaleCard,
		frenchStatsSpecific,
	};
}

export default defineContentScript({
	matches: ['https://translate.wordpress.org/*'],
	main() {
		// Évite de réinsérer les éléments SPTE si l'extension est rechargée sans navigation (ex: about:debugging).
		if (document.getElementById('sp-controls')) { return; }

		const ctx = buildContext();

		browser.storage.local.get('spteSettings').then((data) => {
			launchProcess(ctx, data.spteSettings);
		});
	},
});
