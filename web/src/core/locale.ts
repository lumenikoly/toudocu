import english from "../../../internal/site/i18n/en.json";
import russian from "../../../internal/site/i18n/ru.json";

export const localeCatalog: Record<string, Record<string, string>> = {
  en: english,
  ru: russian,
};

export function catalog(locale: string): Record<string, string> {
  const language = locale.trim().toLowerCase().replaceAll("_", "-").split("-", 1)[0];
  return localeCatalog[language] || localeCatalog.en;
}

export function text(key: string, values: unknown[] = []): string {
  const locale = window.ToudocuPage?.ui.locale || document.documentElement.lang || "en";
  const template = catalog(locale)[key] || localeCatalog.en[key] || key;
  return values.reduce((result: string, value, index) => result.replaceAll(`{${index}}`, String(value ?? "")), template);
}
