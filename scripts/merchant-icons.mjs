// Regenerates src/merchant-icons.json from the pinned simple-icons package (CC0 artwork).
// Logos ship inside the extension: merchant names are never sent to a logo service.
// Only real marks are listed. A merchant without an official mark here gets a category icon.
import * as icons from 'simple-icons';
import { writeFile } from 'node:fs/promises';

// Order matters: more specific names come before broader ones (Uber Eats before Uber).
const brands = [
  ['ubereats', /^uber\s*eats\b/],
  ['uber', /^uber\b/],
  ['doordash', /^door\s*dash\b/],
  ['deliveroo', /^deliveroo\b/],
  ['mcdonalds', /^(mc\s*donald'?s|maccas)\b/],
  ['kfc', /^kfc\b/],
  ['hungryjacks', /^hungry\s*jack'?s\b/],
  ['burgerking', /^burger\s*king\b/],
  ['starbucks', /^starbucks\b/],
  ['aldisud', /^aldi\b/, 'ALDI'],
  ['ikea', /^ikea\b/],
  ['target', /^target\b/],
  ['uniqlo', /^uniqlo\b/],
  ['zara', /^zara\b/],
  ['nike', /^nike\b/],
  ['adidas', /^adidas\b/],
  ['ebay', /^ebay\b/],
  ['shell', /^shell\b/],
  ['spotify', /^spotify\b/],
  ['netflix', /^netflix\b/],
  ['applemusic', /^apple\s*music\b/],
  ['appletv', /^apple\s*tv\b/],
  ['icloud', /^icloud\b/],
  ['apple', /^apple(\.com)?\b/],
  ['youtubemusic', /^youtube\s*music\b/],
  ['youtube', /^youtube\b/],
  ['googleplay', /^google\s*play\b/],
  ['google', /^google\b/],
  ['audible', /^audible\b/],
  ['twitch', /^twitch\b/],
  ['patreon', /^patreon\b/],
  ['substack', /^substack\b/],
  ['discord', /^discord\b/],
  ['steam', /^steam(\s*games|powered)?$|^steam\s*(purchase|store)\b/],
  ['playstation', /^(sony\s*)?playstation\b/],
  ['duolingo', /^duolingo\b/],
  ['tinder', /^tinder\b/],
  ['claude', /^claude(\.ai)?\b/],
  ['anthropic', /^anthropic\b/],
  ['perplexity', /^perplexity\b/],
  ['github', /^github\b/],
  ['notion', /^notion\b/],
  ['dropbox', /^dropbox\b/],
  ['airbnb', /^airbnb\b/],
  ['bookingdotcom', /^booking\.com\b/],
  ['expedia', /^expedia\b/],
  ['qantas', /^qantas\b/],
  ['vodafone', /^vodafone\b/],
  ['hellofresh', /^hello\s*fresh\b/],
  ['paypal', /^paypal\b/],
  ['afterpay', /^afterpay\b/],
];
const bySlug = new Map(
  Object.values(icons)
    .filter((icon) => icon?.slug)
    .map((icon) => [icon.slug, icon]),
);
const output = brands.map(([slug, match, title]) => {
  const icon = bySlug.get(slug);
  if (!icon) throw new Error(`simple-icons has no ${slug} icon`);
  return {
    slug,
    title: title ?? icon.title,
    match: match.source,
    path: icon.path,
    hex: icon.hex,
    source: icon.source,
  };
});
await writeFile('src/merchant-icons.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.length} merchant logos.`);
