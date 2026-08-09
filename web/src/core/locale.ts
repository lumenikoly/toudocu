const baseRussian: Record<string, string> = {
  bootstrapUnavailable: "Данные страницы недоступны",
  unsupportedSchema: "Версия данных страницы не поддерживается",
  emptyCollection: "Нет данных для отображения",
  capabilityUnavailable: "Функция недоступна в этом режиме",
};

export const localeCatalog: Record<string, Record<string, string>> = {
  ru: {
    ...baseRussian,
  },
  en: {
    ...baseRussian,
    bootstrapUnavailable: "Page data is unavailable",
    unsupportedSchema: "The page data version is unsupported",
    emptyCollection: "There is no data to display",
    capabilityUnavailable: "This capability is unavailable in the current runtime",
  },
};

export type Locale = keyof typeof localeCatalog;

export function catalog(locale: string) {
  return localeCatalog[locale as Locale] || localeCatalog.en;
}

export function registerMessages(messages: Record<string, string>, translations: Record<string, string> = {}): void {
  Object.assign(localeCatalog.ru, messages);
  Object.assign(localeCatalog.en, messages, translations);
}

export function text(key: string, values: unknown[] = []): string {
  const locale = window.ToudocuPage?.ui.locale || document.documentElement.lang || "en";
  const template = catalog(locale)[key] || localeCatalog.en[key] || key;
  return values.reduce((result: string, value, index) => result.replaceAll(`{${index}}`, String(value ?? "")), template);
}
