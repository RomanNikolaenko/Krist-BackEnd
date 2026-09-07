/**
 * Five customers, and everything they have done to the shop.
 *
 * This file exists because the storefront used to ship with its content
 * hard-coded: the same two reviews under every product, the same saved cards on
 * every account, a wish list nobody had filled. None of that survives a question
 * as simple as "who wrote this?", so it is written here as people instead —
 * each with a history, and every review attributable to one of them.
 *
 * Addresses use the cities and states the address form offers, and five-digit
 * pins, because the form validates both. A seeded value the form rejects is a
 * screen that cannot be saved without first being retyped.
 *
 * Products are named by the numeric id they carry in `data/catalogue.json`, so
 * an order line and the review that followed it can be read side by side.
 */

export type DemoCardBrand = 'VISA' | 'MASTERCARD';
export type DemoLineStatus = 'PROCESSING' | 'DELIVERED' | 'CANCELLED';

export interface DemoAddress {
  name: string;
  phone: string;
  line1: string;
  area: string;
  city: string;
  pin: string;
  state: string;
  isDefault: boolean;
}

export interface DemoCard {
  label: string;
  holder: string;
  brand: DemoCardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

export interface DemoOrderLine {
  product: number;
  size: string;
  color: string | null;
  qty: number;
  status: DemoLineStatus;
}

export interface DemoOrder {
  daysAgo: number;
  discount?: number;
  lines: DemoOrderLine[];
}

export interface DemoReview {
  product: number;
  rating: number;
  title: string;
  body: string;
  daysAgo: number;
}

/** A review someone found useful, named by who wrote it and what it was about. */
export interface DemoLike {
  author: string;
  product: number;
}

export interface DemoPerson {
  email: string;
  /**
   * Which role to give them. Everyone shops; one of them also runs the
   * catalogue, so the admin screens have somebody to be tried as without
   * handing a real account out.
   */
  role?: 'CUSTOMER' | 'ADMIN';
  firstName: string;
  lastName: string;
  phone: string;
  avatar: string;
  addressLine: string;
  addresses: DemoAddress[];
  cards: DemoCard[];
  wishlist: number[];
  orders: DemoOrder[];
  reviews: DemoReview[];
  likes: DemoLike[];
}

const avatar = (name: string): string => `https://picsum.photos/seed/krist-user-${name}/200/200`;

export const DEMO_PEOPLE: DemoPerson[] = [
  {
    email: 'amelia.hart@example.com',
    firstName: 'Amelia',
    lastName: 'Hart',
    phone: '(512) 555-0142',
    avatar: avatar('amelia'),
    addressLine: '1904 Barton Springs Rd, Austin',
    addresses: [
      {
        name: 'Amelia Hart',
        phone: '(512) 555-0142',
        line1: '1904 Barton Springs Rd',
        area: 'Zilker',
        city: 'Austin',
        pin: '73301',
        state: 'Texas',
        isDefault: true,
      },
      {
        name: 'Amelia Hart',
        phone: '(512) 555-0177',
        line1: '600 Congress Ave, Suite 14',
        area: 'Downtown',
        city: 'Austin',
        pin: '73344',
        state: 'Texas',
        isDefault: false,
      },
    ],
    cards: [
      {
        label: 'Everyday Visa',
        holder: 'Amelia Hart',
        brand: 'VISA',
        last4: '4021',
        expiryMonth: 9,
        expiryYear: 2028,
        isDefault: true,
      },
      {
        label: 'Travel Mastercard',
        holder: 'Amelia Hart',
        brand: 'MASTERCARD',
        last4: '8830',
        expiryMonth: 3,
        expiryYear: 2027,
        isDefault: false,
      },
    ],
    wishlist: [18, 27, 45, 31, 48, 26],
    orders: [
      {
        daysAgo: 40,
        lines: [
          { product: 27, size: 'M', color: 'Blue', qty: 1, status: 'DELIVERED' },
          { product: 31, size: 'Regular', color: 'Yellow', qty: 1, status: 'DELIVERED' },
        ],
      },
      {
        daysAgo: 6,
        lines: [{ product: 45, size: 'M', color: 'Black', qty: 1, status: 'PROCESSING' }],
      },
    ],
    reviews: [
      {
        product: 27,
        rating: 5,
        title: 'Fits exactly as pictured',
        body: 'I had given up on ordering denim online and this changed my mind. The crop sits at the waist rather than above it, the sleeves end where they should, and the blue is the mid-wash in the photo and not the grey-blue you usually get. Two washes in, no fading at the seams.',
        daysAgo: 33,
      },
      {
        product: 18,
        rating: 4,
        title: 'Warm, but the sleeves run long',
        body: 'The wool is heavy in the way you want a winter coat to be, and it holds its shape on a hanger instead of collapsing. My only complaint is the sleeves, which needed taking up by about an inch. Worth the trip to the tailor, but budget for it.',
        daysAgo: 28,
      },
      {
        product: 45,
        rating: 3,
        title: 'Beautiful, not for a whole day',
        body: 'They photograph wonderfully and the leather is soft from the first wear, so there is no breaking-in period. The heel is narrower than it looks though, and after about four hours I was thinking about it. Fine for dinner, not for a conference.',
        daysAgo: 4,
      },
      {
        product: 25,
        rating: 4,
        title: 'Lovely cotton, size up',
        body: 'The fabric is the reason to buy this. It is proper cotton that breathes in the heat instead of sticking. It does run small across the shoulders, so I went one size up and it hangs correctly now.',
        daysAgo: 21,
      },
      {
        product: 31,
        rating: 5,
        title: 'The chain strap makes it',
        body: 'Bought it expecting a plain quilted bag and got something that reads far more expensive than it is. The chain is properly weighted and does not dig in, and the interior has enough structure that it does not fold over on itself when it is half empty.',
        daysAgo: 35,
      },
    ],
    likes: [
      { author: 'daniel.osei@example.com', product: 29 },
      { author: 'priya.raman@example.com', product: 25 },
      { author: 'lena.fischer@example.com', product: 18 },
    ],
  },

  {
    email: 'daniel.osei@example.com',
    firstName: 'Daniel',
    lastName: 'Osei',
    phone: '(630) 555-0198',
    avatar: avatar('daniel'),
    addressLine: '512 S Washington St, Naperville',
    addresses: [
      {
        name: 'Daniel Osei',
        phone: '(630) 555-0198',
        line1: '512 S Washington St',
        area: 'Historic District',
        city: 'Naperville',
        pin: '60540',
        state: 'Illinois',
        isDefault: true,
      },
    ],
    cards: [
      {
        label: 'Main Mastercard',
        holder: 'Daniel Osei',
        brand: 'MASTERCARD',
        last4: '5512',
        expiryMonth: 11,
        expiryYear: 2029,
        isDefault: true,
      },
    ],
    wishlist: [29, 4, 40, 20, 22, 43],
    orders: [
      {
        daysAgo: 65,
        lines: [{ product: 29, size: 'L', color: 'Black', qty: 1, status: 'DELIVERED' }],
      },
      {
        daysAgo: 22,
        discount: 10,
        lines: [
          { product: 40, size: 'XL', color: 'Black', qty: 1, status: 'DELIVERED' },
          { product: 22, size: 'Regular', color: 'Black', qty: 1, status: 'DELIVERED' },
        ],
      },
      {
        daysAgo: 3,
        lines: [{ product: 4, size: 'L', color: 'Blue', qty: 1, status: 'PROCESSING' }],
      },
    ],
    reviews: [
      {
        product: 29,
        rating: 5,
        title: 'The only pair I reach for',
        body: 'Six weeks of daily wear, including a fortnight of walking a city on holiday, and the sole shows almost nothing. They looked stiff out of the box but were comfortable by the second day. The black is a true black rather than washed charcoal, which matters if you are wearing them with anything smart.',
        daysAgo: 58,
      },
      {
        product: 4,
        rating: 4,
        title: 'Good for the price, narrow toe box',
        body: 'For what they cost these punch well above their weight. The cushioning is real and it has not flattened out after a month of short runs. The toe box is tight if you have wide feet, which cost it a star from me. Everything else is right.',
        daysAgo: 1,
      },
      {
        product: 40,
        rating: 5,
        title: 'Survived a Chicago January',
        body: 'That is the whole review, really. Minus fifteen with wind off the lake and I was comfortable in a shirt underneath it. The hood is lined rather than bare nylon and the cuffs actually seal, which is where cheaper puffers give up.',
        daysAgo: 16,
      },
      {
        product: 20,
        rating: 4,
        title: 'Strap needed a week to soften',
        body: 'The face is exactly as pictured and the movement has kept time to within a couple of seconds. The leather starts stiff enough to be uncomfortable and took about a week of wear before it sat properly. Worth knowing so you do not send it back on day two.',
        daysAgo: 30,
      },
    ],
    likes: [
      { author: 'marcus.bell@example.com', product: 20 },
      { author: 'marcus.bell@example.com', product: 44 },
    ],
  },

  {
    email: 'priya.raman@example.com',
    firstName: 'Priya',
    lastName: 'Raman',
    phone: '(973) 555-0126',
    avatar: avatar('priya'),
    addressLine: '78 Passaic Ave, Fairfield',
    addresses: [
      {
        name: 'Priya Raman',
        phone: '(973) 555-0126',
        line1: '78 Passaic Ave',
        area: 'Fairfield Center',
        city: 'Fairfield',
        pin: '07004',
        state: 'New Jersey',
        isDefault: true,
      },
      {
        name: 'Priya Raman',
        phone: '(973) 555-0131',
        line1: '210 Bloomfield Ave, Apt 3B',
        area: 'Caldwell',
        city: 'Fairfield',
        pin: '07006',
        state: 'New Jersey',
        isDefault: false,
      },
    ],
    cards: [
      {
        label: 'Personal Visa',
        holder: 'Priya Raman',
        brand: 'VISA',
        last4: '3390',
        expiryMonth: 6,
        expiryYear: 2027,
        isDefault: true,
      },
      {
        label: 'Household Visa',
        holder: 'Priya Raman',
        brand: 'VISA',
        last4: '7742',
        expiryMonth: 1,
        expiryYear: 2030,
        isDefault: false,
      },
    ],
    wishlist: [25, 10, 47, 28, 30, 42],
    orders: [
      {
        daysAgo: 50,
        lines: [{ product: 25, size: 'M', color: 'Yellow', qty: 2, status: 'DELIVERED' }],
      },
      {
        daysAgo: 12,
        lines: [
          { product: 47, size: 'Regular', color: 'Red', qty: 1, status: 'DELIVERED' },
          { product: 30, size: 'M', color: 'Blue', qty: 1, status: 'DELIVERED' },
        ],
      },
      {
        daysAgo: 2,
        lines: [{ product: 10, size: 'S', color: 'Red', qty: 1, status: 'PROCESSING' }],
      },
    ],
    reviews: [
      {
        product: 25,
        rating: 5,
        title: 'Third one I have bought',
        body: 'I keep coming back to this because it is the rare kurta that survives a hot wash without the colour going chalky. The yellow is still the yellow it arrived as after a summer of wearing it weekly. The side slits are cut high enough to be comfortable sitting down, which sounds trivial until you own one that is not.',
        daysAgo: 44,
      },
      {
        product: 10,
        rating: 4,
        title: 'The embroidery is the real thing',
        body: 'I expected a print and it is actual thread work, which is not what I paid for at this price. Docking a star only because the lining is shorter than the outer layer, so it needs a slip underneath in daylight. The fit through the waist is generous and forgiving.',
        daysAgo: 1,
      },
      {
        product: 47,
        rating: 4,
        title: 'Holds its shape, holds a laptop',
        body: 'Structured enough to stand up on its own on the floor of a train, and a thirteen-inch laptop goes in without forcing it. The magnetic closure is the weak point. It is fine, but I would have preferred a zip on a bag this size.',
        daysAgo: 8,
      },
      {
        product: 30,
        rating: 5,
        title: 'Twelve-hour shifts, no complaints',
        body: 'I am on my feet all day and these are the first slip-ons I have not wanted to take off by the afternoon. The heel does not slide, which is usually the problem with this style. Machine washed once already and they came out fine.',
        daysAgo: 6,
      },
    ],
    likes: [
      { author: 'amelia.hart@example.com', product: 27 },
      { author: 'lena.fischer@example.com', product: 8 },
      { author: 'daniel.osei@example.com', product: 40 },
    ],
  },

  {
    email: 'marcus.bell@example.com',
    role: 'ADMIN',
    firstName: 'Marcus',
    lastName: 'Bell',
    phone: '(702) 555-0163',
    avatar: avatar('marcus'),
    addressLine: '3320 E Brown Rd, Mesa',
    addresses: [
      {
        name: 'Marcus Bell',
        phone: '(702) 555-0163',
        line1: '3320 E Brown Rd',
        area: 'East Mesa',
        city: 'Mesa',
        pin: '85201',
        state: 'Nevada',
        isDefault: true,
      },
    ],
    cards: [
      {
        label: 'Mastercard',
        holder: 'Marcus Bell',
        brand: 'MASTERCARD',
        last4: '1188',
        expiryMonth: 4,
        expiryYear: 2028,
        isDefault: true,
      },
    ],
    wishlist: [20, 33, 23, 43, 46],
    orders: [
      {
        daysAgo: 70,
        lines: [{ product: 20, size: 'Regular', color: 'Black', qty: 1, status: 'DELIVERED' }],
      },
      {
        daysAgo: 30,
        lines: [{ product: 44, size: 'L', color: 'Blue', qty: 1, status: 'CANCELLED' }],
      },
      {
        daysAgo: 9,
        lines: [
          { product: 33, size: 'Regular', color: 'Black', qty: 1, status: 'DELIVERED' },
          { product: 23, size: 'L', color: 'Black', qty: 1, status: 'DELIVERED' },
        ],
      },
    ],
    reviews: [
      {
        product: 20,
        rating: 5,
        title: 'Looks twice what it cost',
        body: 'The case is thinner than the photos suggest, which is the right direction to be wrong in. It goes under a cuff without catching. Domed glass picks up a bit of glare in the sun but that is the style. Nine weeks in and it has not needed setting.',
        daysAgo: 62,
      },
      {
        product: 33,
        rating: 4,
        title: 'Genuine, and in the proper case',
        body: 'Arrived with the branded case, cloth and papers, which is the first thing I checked at this price. Lenses are noticeably better than the pair I was replacing. The metal frame is light enough to forget about, though it needed a small adjustment at an optician to stop it sliding.',
        daysAgo: 5,
      },
      {
        product: 44,
        rating: 2,
        title: 'Slim means slim',
        body: 'I take a large in every other shirt on this site and could not fasten this one across the chest. The fabric and the collar are both good, so this is a sizing complaint rather than a quality one, but the cut is at least a size off what it is labelled and the return took ten days.',
        daysAgo: 26,
      },
      {
        product: 29,
        rating: 4,
        title: 'Half a size up is the move',
        body: 'Comfortable and well made, and the leather has creased evenly rather than cracking. They come up short though. I ordered my usual and went back for the half size, which is worth knowing before you order.',
        daysAgo: 19,
      },
    ],
    likes: [
      { author: 'daniel.osei@example.com', product: 29 },
      { author: 'daniel.osei@example.com', product: 40 },
    ],
  },

  {
    email: 'lena.fischer@example.com',
    firstName: 'Lena',
    lastName: 'Fischer',
    phone: '(469) 555-0109',
    avatar: avatar('lena'),
    addressLine: '1401 Custer Rd, Richardson',
    addresses: [
      {
        name: 'Lena Fischer',
        phone: '(469) 555-0109',
        line1: '1401 Custer Rd',
        area: 'Canyon Creek',
        city: 'Richardson',
        pin: '75080',
        state: 'Texas',
        isDefault: true,
      },
    ],
    cards: [
      {
        label: 'Visa',
        holder: 'Lena Fischer',
        brand: 'VISA',
        last4: '6034',
        expiryMonth: 8,
        expiryYear: 2029,
        isDefault: true,
      },
    ],
    wishlist: [19, 42, 26, 48, 8, 37],
    orders: [
      {
        daysAgo: 55,
        lines: [
          { product: 18, size: 'M', color: 'Black', qty: 1, status: 'DELIVERED' },
          { product: 19, size: 'M', color: 'Green', qty: 1, status: 'DELIVERED' },
        ],
      },
      {
        daysAgo: 15,
        lines: [{ product: 8, size: 'S', color: 'Red', qty: 1, status: 'DELIVERED' }],
      },
      {
        daysAgo: 1,
        lines: [{ product: 48, size: 'Regular', color: 'Yellow', qty: 1, status: 'PROCESSING' }],
      },
    ],
    reviews: [
      {
        product: 19,
        rating: 4,
        title: 'Warm without the bulk',
        body: 'Thin enough to go under a coat and still warm on its own indoors, which is the whole point of a ribbed knit and is harder to find than it should be. The green is deeper than the photograph. It has pilled slightly under the arms after a month, hence four rather than five.',
        daysAgo: 47,
      },
      {
        product: 48,
        rating: 5,
        title: 'The mesh band actually adjusts',
        body: 'Most mesh straps at this price come with a clasp that only sits in two or three positions. This one slides properly and locks flat, so it fits a small wrist without looking like it is falling off. The face is small in a deliberate way rather than a cheap one.',
        daysAgo: 0,
      },
      {
        product: 8,
        rating: 5,
        title: 'She has not taken it off',
        body: 'Bought for a five-year-old who has worn it four days running. The print has come through two washes without cracking, which is more than I can say for the last one. The cut is roomy, so it fits a tall five-year-old with room to grow.',
        daysAgo: 11,
      },
      {
        product: 18,
        rating: 5,
        title: 'Worth every cent',
        body: 'I hesitated at the price and should not have. It is fully lined, the shoulders are cut so it works over a jacket, and the wool has not bobbled at the cuffs where my last coat gave up within a season. If you are on the fence, this is the one.',
        daysAgo: 48,
      },
      {
        product: 26,
        rating: 3,
        title: 'Nice fabric, awkward length',
        body: 'The pleating holds beautifully and the fabric has real weight to it. My problem is the length, which lands at the widest part of my calf. That is unflattering on me and not something a hem can fix without losing the pleats. Anyone taller will likely love it.',
        daysAgo: 24,
      },
    ],
    likes: [
      { author: 'amelia.hart@example.com', product: 18 },
      { author: 'priya.raman@example.com', product: 30 },
      { author: 'marcus.bell@example.com', product: 20 },
    ],
  },
];
