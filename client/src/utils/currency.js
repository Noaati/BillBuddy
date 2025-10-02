export function getCurrencySymbol(code, locale = 'he-IL') {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,             // למשל "USD" / "EUR" / "ILS"
      currencyDisplay: 'narrowSymbol', // או 'symbol' אם תרצי תמיד "₪"/"$"/"€" גם עם קידומת מדינה
      minimumFractionDigits: 0
    }).formatToParts(0);
    const cur = parts.find(p => p.type === 'currency');
    return cur ? cur.value : code; // נפילה אחורה לקוד אם אין סמל
  } catch {
    return code;
  }
}
