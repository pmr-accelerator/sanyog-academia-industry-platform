// Minimal i18n: all UI strings that matter for navigation live in message catalogues.
// To add a language: create src/i18n/<code>.json with the same keys and register it below.
import en from './en.json';

const catalogues = { en };
let current = localStorage.getItem('lang') && catalogues[localStorage.getItem('lang')] ? localStorage.getItem('lang') : 'en';

export const languages = Object.keys(catalogues);
export const setLanguage = (l) => { if (catalogues[l]) { current = l; localStorage.setItem('lang', l); document.documentElement.lang = l; } };
export const t = (key, fallback) => catalogues[current]?.[key] ?? catalogues.en[key] ?? fallback ?? key;
