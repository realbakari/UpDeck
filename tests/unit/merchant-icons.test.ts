import { describe, expect, it } from 'vitest';
import { findBrand } from '../../src/components/MerchantIcon';

describe('merchant logos', () => {
  it.each([
    ['Uber Eats', 'ubereats'],
    ['Uber', 'uber'],
    ["McDonald's", 'mcdonalds'],
    ["Hungry Jack's", 'hungryjacks'],
    ['ALDI Stores', 'aldisud'],
    ['Apple Music', 'applemusic'],
    ['Apple.com/bill', 'apple'],
    ['Booking.com', 'bookingdotcom'],
    ['Claude.ai Subscription', 'claude'],
  ])('uses the real mark for %s', (merchant, slug) => {
    expect(findBrand(merchant)?.slug).toBe(slug);
  });
  it.each(['Woolworths', 'Coles', 'Steamed Dumpling Bar', 'Applecross Bakery', 'Targeted Ads Pty'])(
    'never invents a logo for %s',
    (merchant) => {
      expect(findBrand(merchant)).toBeUndefined();
    },
  );
});
