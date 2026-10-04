import { describe, expect, it } from 'vitest';
import { productNames, isInsideProductName } from './product-names';

/**
 * @param {string} text
 * @param {string} word
 * @returns {boolean}
 */
function isWordInsideProductName(text, word) {
	return isInsideProductName(text, text.indexOf(word), word.length);
}

describe('isInsideProductName', () => {
	it('reconnaît un mot à l\'intérieur d\'un nom de marque', () => {
		expect(isWordInsideProductName('Activer Google Analytics', 'Analytics')).toBe(true);
	});
	it('reconnaît un nom quelle que soit sa casse', () => {
		expect(isWordInsideProductName('Activer google analytics', 'analytics')).toBe(true);
	});
	it('ne reconnaît pas le même mot en dehors d\'un nom', () => {
		expect(isWordInsideProductName('Le suivi Analytics', 'Analytics')).toBe(false);
	});
	it('ne reconnaît pas un mot proche d\'un nom sans en faire partie', () => {
		expect(isWordInsideProductName('Le moteur Search engine', 'Search')).toBe(false);
	});
	it('ne reconnaît un nom que sous forme de mots entiers', () => {
		expect(isWordInsideProductName('Image Smushing', 'Smush')).toBe(false);
	});
	it('reconnaît un mot dans un nom plus long qui en contient un autre de la liste', () => {
		expect(isWordInsideProductName('Vérification Google Search Console', 'Search')).toBe(true);
	});
	it('reconnaît un nom contenant « & » dans du HTML', () => {
		expect(isWordInsideProductName('Avec Search &amp; Filter', 'Filter')).toBe(true);
	});
	it('reconnaît chacun des noms de la liste', () => {
		for (const name of productNames) {
			const html = `Avec ${name.replaceAll('&', '&amp;')} activé`;
			expect(isInsideProductName(html, html.indexOf(name.charAt(0), 5), 1), name).toBe(true);
		}
	});
});
