import en from "@/messages/en.json";

export type Messages = typeof en;

/**
 * Simple typed translation helper.
 * Usage: t("landing.hero.headline") or t("common.brand")
 *
 * When ready to go multilingual, swap this for next-intl's useTranslations()
 * and the messages/en.json structure is already compatible.
 */
export function t(key: string): string {
  const segments = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = en;
  for (const segment of segments) {
    value = value?.[segment];
    if (value === undefined) return key; // fallback to key if missing
  }
  return typeof value === "string" ? value : key;
}

/** Load all messages for a section (e.g. arrays like steps, features, faqs) */
export function getMessages() {
  return en;
}
