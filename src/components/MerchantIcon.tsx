import {
  AirplaneTilt,
  ArrowDownLeft,
  ArrowsLeftRight,
  Basket,
  BeerStein,
  Car,
  Coffee,
  FilmSlate,
  FirstAidKit,
  ForkKnife,
  GameController,
  GasPump,
  Gift,
  House,
  Lightning,
  MusicNotes,
  PawPrint,
  PhoneCall,
  ShoppingBag,
  TShirt,
  Taxi,
  Train,
  Barbell,
  WifiHigh,
  type Icon,
} from '@phosphor-icons/react';
import logos from '../merchant-icons.json';

const brands = logos.map((logo) => ({ ...logo, pattern: new RegExp(logo.match, 'i') }));
export const findBrand = (merchant: string) => brands.find((b) => b.pattern.test(merchant.trim()));
// Up's own category names decide the fallback, so an unknown merchant is never given a logo.
const categoryIcons: [RegExp, Icon][] = [
  [/grocer/i, Basket],
  [/restaurant|cafe|café/i, Coffee],
  [/takeaway/i, ForkKnife],
  [/pub|bar|booze/i, BeerStein],
  [/public transport/i, Train],
  [/taxi|share car/i, Taxi],
  [/fuel/i, GasPump],
  [/car|parking|toll|rego/i, Car],
  [/utilit/i, Lightning],
  [/internet/i, WifiHigh],
  [/mobile|phone/i, PhoneCall],
  [/rent|mortgage|home/i, House],
  [/tv|music|streaming/i, MusicNotes],
  [/game|software|app/i, GameController],
  [/event|gig|cinema/i, FilmSlate],
  [/holiday|travel/i, AirplaneTilt],
  [/clothing|accessor/i, TShirt],
  [/health|medical/i, FirstAidKit],
  [/fitness|wellbeing/i, Barbell],
  [/pet/i, PawPrint],
  [/gift|charity/i, Gift],
];
/** Brand marks that are near-black need the theme's ink colour to stay visible in dark mode. */
const isDark = (hex: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
};

export function MerchantIcon({
  name,
  category = '',
  incoming = false,
  transfer = false,
}: {
  name: string;
  category?: string;
  incoming?: boolean;
  transfer?: boolean;
}) {
  const brand = transfer || incoming ? undefined : findBrand(name);
  if (brand)
    return (
      <span className="merchant-icon brand-icon" title={brand.title}>
        <svg viewBox="0 0 24 24" width="22" height="22" role="img" aria-label={brand.title}>
          <path d={brand.path} fill={isDark(brand.hex) ? 'currentColor' : `#${brand.hex}`} />
        </svg>
      </span>
    );
  const Glyph = transfer
    ? ArrowsLeftRight
    : incoming
      ? ArrowDownLeft
      : (categoryIcons.find(([pattern]) => pattern.test(category))?.[1] ?? ShoppingBag);
  return (
    <span className={`merchant-icon ${incoming ? 'income' : ''}`}>
      <Glyph size={21} />
    </span>
  );
}
