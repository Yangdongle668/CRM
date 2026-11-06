const EMAIL_ADDRESS = /[\p{L}\p{N}.!#$%&'*+\/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const WEBSITE = /(?:https?:\/\/|www\.)[^\s<>"'\]\u3000-\u303f]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|edu|gov|io|ai|co|cn|uk|de|jp|kr|in|eu|tw|hk|sg|au|us|ca|fr|me|tech|biz|info|app|dev)(?:\/[^\s<>"'\]]*)?(?![a-z0-9_-])/gi;
const PHONE = /(?<![\p{L}\p{N}])(?:\+\s*)?(?:\(\d{2,5}\)|\d{1,5})[ .\t-]*(?:\d[ .\t()-]*){5,15}\d(?:\s*(?:ext\.?|x|转)\s*\d{1,6})?(?![\p{L}\p{N}])/giu;
const LEGAL_NAME = /\b(?:[A-Z][\w&'-]*[ \t]+){1,6}(?:Inc\.?|Ltd\.?|LLC|GmbH|Corp\.?|Pvt\.? Ltd\.?|Co\.,? Ltd\.?)(?!\w)|[\p{Script=Han}]{2,28}(?:股份有限公司|有限责任公司|有限公司)/gu;

export function createEmailAiRedactor(companyNames: (string | null)[], domains: string[]) {
  const aliases = new Map<string, string>();
  const identify = (address: string) => {
    const key = address.toLowerCase();
    const previous = aliases.get(key);
    if (previous) return previous;
    const alias = `[参与人 ${aliases.size + 1}]`;
    aliases.set(key, alias);
    return alias;
  };

  const names = [...new Set(companyNames.flatMap((name) => {
    if (!name?.trim()) return [];
    const full = name.trim();
    const short = full.replace(/[\s,]+(?:Inc\.?|LLC|Ltd\.?|GmbH|Corp\.?|Co\.,?\s*Ltd\.?)$/i, '').trim();
    return [full, short].filter((value) => value.length >= 2);
  }))];
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const knownDomains = domains.filter(Boolean).sort((a, b) => b.length - a.length).map(escape);
  const knownWebsites = knownDomains.length
    ? new RegExp(`(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*(?:${knownDomains.join('|')})(?![a-z0-9.-])(?:/[^\\s<>"']*)?`, 'gi')
    : null;
  const company = names.length ? new RegExp(names.sort((a, b) => b.length - a.length)
    .map((name) => /\p{Script=Han}/u.test(name) ? escape(name)
      : `(?<![\\p{L}\\p{N}])${escape(name).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`)
    .join('|'), 'giu') : null;

  return {
    participants: (value: string | null) => (value?.normalize('NFKC').match(EMAIL_ADDRESS) ?? []).map(identify),
    text: (value: string) => {
      let text = value.normalize('NFKC').replace(EMAIL_ADDRESS, identify).replace(WEBSITE, '[网站]');
      if (knownWebsites) text = text.replace(knownWebsites, '[网站]');
      text = text.replace(PHONE, (match) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(match)) return match;
        return '[电话]';
      });
      text = text.replace(LEGAL_NAME, '[公司]');
      return company ? text.replace(company, '[公司]') : text;
    },
  };
}
