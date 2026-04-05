const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './db/database.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Seeding database...');

const SALT = bcrypt.genSaltSync(12);

// ── Users ──────────────────────────────────────────────────────────────────────
const users = [
    { username: 'admin', email: 'admin@theoverlandpost.com', password: 'admin123', display_name: 'The Editor', bio: 'Running The Overland Post from a solar-powered Sprinter somewhere in southern Europe.', location: 'On the road', van_name: 'Atlas', van_type: 'Mercedes Sprinter 316 CDI', role: 'admin' },
    { username: 'moderator', email: 'mod@theoverlandpost.com', password: 'mod123', display_name: 'Trail Boss', bio: 'Full-time vanlifer and community moderator. 3 years on the road in our converted Crafter.', location: 'Portugal', van_name: 'Fern', van_type: 'VW Crafter MWB', role: 'admin' },
    { username: 'sarahwheels', email: 'sarah@example.com', password: 'password123', display_name: 'Sarah Wheels', bio: 'Solo female traveller. Converted a Peugeot Boxer and now exploring Scandinavia.', location: 'Norway', van_name: 'Birdie', van_type: 'Peugeot Boxer L3H2', role: 'contributor' },
    { username: 'marcoroutes', email: 'marco@example.com', password: 'password123', display_name: 'Marco', bio: 'Italian overlander. Love mountain roads and wild camping.', location: 'Italy', van_name: 'Luna', van_type: 'Fiat Ducato', role: 'member' },
    { username: 'jenbuilds', email: 'jen@example.com', password: 'password123', display_name: 'Jen & Tom', bio: 'Couple converting a Transit into our forever home. Documenting every step.', location: 'UK', van_name: 'Rusty', van_type: 'Ford Transit L4H3', role: 'member' },
];

const userIds = {};
for (const u of users) {
    const hash = bcrypt.hashSync(u.password, SALT);
    const result = db.prepare(`INSERT OR IGNORE INTO users (username, email, password_hash, display_name, bio, location, van_name, van_type, role, reputation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        u.username, u.email, hash, u.display_name, u.bio, u.location, u.van_name, u.van_type, u.role, u.role === 'admin' ? 50 : u.role === 'contributor' ? 25 : 10
    );
    if (result.changes > 0) {
        userIds[u.username] = result.lastInsertRowid;
        console.log(`  Created user: ${u.username} (id: ${result.lastInsertRowid})`);
    } else {
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
        userIds[u.username] = existing.id;
        console.log(`  User exists: ${u.username} (id: ${existing.id})`);
    }
}

// ── Articles ───────────────────────────────────────────────────────────────────
const articles = [
    {
        author: 'admin', title: 'The Ultimate Guide to Wild Camping in Portugal',
        slug: 'ultimate-guide-wild-camping-portugal',
        summary: 'Everything you need to know about finding, staying at, and respecting wild camping spots across Portugal.',
        content: `Portugal has long been a favourite destination for vanlifers, and for good reason. The combination of year-round mild weather, stunning coastline, affordable living, and a generally tolerant attitude towards wild camping makes it an ideal place to spend extended periods on the road.

## The Legal Situation

Wild camping in Portugal exists in a grey area. While technically motorhomes are not supposed to park overnight outside designated areas, enforcement varies hugely by region. The Algarve has cracked down significantly since 2020, with regular police patrols and fines. The Alentejo coast and central Portugal remain much more relaxed.

### Key Rules to Follow

- **Never camp in protected natural areas** — fines are steep and regularly enforced
- **Don't set up camp** — keep chairs, tables, and awnings inside or put away
- **Respect 48-hour limits** — many municipalities allow overnight parking but not extended stays
- **Take all waste with you** — this should go without saying

## Best Regions

### The Silver Coast (Costa de Prata)

Running from Lisbon north to Porto, this stretch of coastline offers dramatic cliffs, long sandy beaches, and relatively few tourists outside of summer. Towns like Nazaré, Peniche, and Ericeira have excellent surf and plenty of quiet parking areas nearby.

### The Alentejo Interior

Rolling plains, cork oak forests, and medieval hilltop villages. The interior Alentejo is one of Europe's least populated areas and wild camping is straightforward. Water can be scarce in summer — fill up at every opportunity.

### Serra da Estrela

Portugal's highest mountain range offers alpine scenery, ski resorts in winter, and cool temperatures in summer when the coast is baking. Several designated motorhome areas with services.

## Essential Tips

1. **Download Park4Night and iOverlander** — community-updated spot databases
2. **Carry extra water** — not all spots have services nearby
3. **Learn basic Portuguese** — locals are much friendlier when you make the effort
4. **Get a Campsuite card** — discounts at many Aires and campsites
5. **Arrive after 6pm, leave before 9am** — the golden rule of stealth camping`,
        category: 'tips', tags: 'portugal,wild-camping,tips,europe', status: 'published', featured: 1
    },
    {
        author: 'sarahwheels', title: 'Solo Female Vanlife: What I Wish I Knew Before Starting',
        slug: 'solo-female-vanlife-what-i-wish-i-knew',
        summary: 'After two years on the road alone, here are the honest truths about solo female vanlife — the good, the hard, and the unexpected.',
        content: `Two years ago I sold my flat in Bristol, bought a beaten-up Peugeot Boxer, and spent three months converting it in my parents' driveway. Since then I've driven through 14 countries and slept in over 400 different spots. Here's what I wish someone had told me.

## Safety Is Mostly About Common Sense

The number one question I get asked is "aren't you scared?" The honest answer is: sometimes, but no more than I was living in a city. Most of the safety advice for solo female vanlife is the same as for anyone living on the road:

- **Trust your gut** — if a spot feels wrong, move on
- **Have a dashcam** and a good lock system
- **Share your location** with a trusted person
- **Park near other vans** when possible
- **Keep a low profile** at night

## The Loneliness Is Real (And That's OK)

Nobody talks about this enough. There will be days — sometimes weeks — where the solitude weighs heavy. I've learned that loneliness isn't a problem to solve, it's a feeling to sit with. That said, there are practical things that help:

- Join vanlife meetups (they're everywhere in summer)
- Use apps like Vanlife Europe and Park4Night to connect with others nearby
- Consider co-working spaces in cities for human contact
- Keep a routine — structure helps enormously

## The Mechanical Stuff Is Learnable

I knew nothing about engines when I started. Now I can change my oil, replace brake pads, bleed the coolant system, and diagnose most warning lights. YouTube, Haynes manuals, and friendly mechanics in small towns have been my teachers.

## Budget Reality Check

My monthly costs average around €800-1000 including:
- Fuel: €200-300
- Food: €250-300
- Insurance/road tax: €80
- Phone/data: €25
- Maintenance fund: €100
- Campsites/aires (occasional): €50-100
- Fun money: €100

This is very achievable with remote work or freelancing.`,
        category: 'lifestyle', tags: 'solo,female,safety,budget', status: 'published', featured: 0
    },
    {
        author: 'admin', title: '12v Electrical Systems Explained: A Beginner\'s Guide',
        slug: '12v-electrical-systems-explained',
        summary: 'Demystifying 12v electrics for van conversions. From batteries to solar, everything you need to plan your system.',
        content: `Understanding your van's electrical system is arguably the most important part of any conversion. Get it wrong and you'll be dealing with flat batteries, blown fuses, or worse — electrical fires. Get it right and you'll have reliable, silent power wherever you park.

## The Basics

Your van's 12v system has four main components:

1. **Battery bank** — stores energy
2. **Charging sources** — solar panels, alternator, shore power
3. **Distribution** — fuse box, wiring, switches
4. **Loads** — lights, USB ports, fridge, water pump, etc.

## Battery Types

### Lead Acid / AGM
- Cheapest upfront
- Heavy
- Can only discharge to 50%
- 300-500 cycle lifespan
- Budget: ~€100-200 per 100Ah

### Lithium (LiFePO4)
- 2-3x the price
- Half the weight
- Can discharge to 80-90%
- 2000-5000 cycle lifespan
- Better long-term value
- Budget: ~€400-800 per 100Ah

**My recommendation:** If budget allows, go lithium. A single 200Ah lithium battery gives you more usable power than two 200Ah AGMs, at less than half the weight.

## Sizing Your System

Calculate your daily energy needs:

| Device | Watts | Hours/day | Wh/day |
|--------|-------|-----------|--------|
| LED lights | 20 | 5 | 100 |
| Phone charging | 15 | 3 | 45 |
| Laptop | 60 | 4 | 240 |
| Compressor fridge | 45 | 12 | 540 |
| Water pump | 60 | 0.5 | 30 |
| **Total** | | | **955 Wh** |

For a lithium setup: 955Wh ÷ 12v = ~80Ah per day
With 200Ah battery at 80% DOD = 160Ah usable = ~2 days autonomy

## Solar Panel Sizing

In southern Europe (summer), expect ~5 peak sun hours per day. In northern Europe or winter, expect 2-3.

955Wh ÷ 5 hours = 191W minimum solar
Add 20% for losses: **~230W recommended**

A single 300W panel on the roof would give you comfortable margin.`,
        category: 'conversions', tags: '12v,electrical,solar,batteries,conversion', status: 'published', featured: 1
    },
];

for (const a of articles) {
    const existing = db.prepare('SELECT id FROM articles WHERE slug = ?').get(a.slug);
    if (!existing) {
        db.prepare(`INSERT INTO articles (author_id, title, slug, summary, content, category, tags, status, featured, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
            .run(userIds[a.author], a.title, a.slug, a.summary, a.content, a.category, a.tags, a.status, a.featured);
        console.log(`  Created article: ${a.title}`);
    }
}

// ── Forum Posts ─────────────────────────────────────────────────────────────────
const forumPosts = [
    { author: 'marcoroutes', title: 'Best mountain passes in the Alps for vans under 3.5t?', slug: 'best-mountain-passes-alps-vans', content: 'Planning a summer trip through the Alps and looking for recommendations on mountain passes that are doable in a standard van (3.5t, 6m long). I know the Stelvio is famous but I\'ve heard it can be quite tight. What are your favourites?\n\nParticularly interested in:\n- Width/gradient suitability for larger vans\n- Wild camping options near the top\n- Best time of year to visit\n\nThanks in advance!', category: 'routes', reply_count: 2, pinned: 0 },
    { author: 'jenbuilds', title: 'Rust repair before conversion — worth it or buy another van?', slug: 'rust-repair-before-conversion', content: 'We bought our Transit for £2,500 and it runs great, but the sills and rear wheel arches have some rust. A body shop quoted us £1,200 for the repair. Is it worth spending nearly half the purchase price on rust repair, or should we look for a cleaner van?\n\nThe engine has 95k miles and runs perfectly. Everything mechanical is solid.', category: 'conversions', reply_count: 1, pinned: 0 },
    { author: 'sarahwheels', title: 'WARNING: Aggressive parking enforcement in Lagos, Algarve', slug: 'warning-parking-enforcement-lagos-algarve', content: '**Heads up everyone** — I was parked at the big car park near Praia de Porto de Mós last night and got a €200 fine at 6am. There are now signs (in Portuguese only) saying no overnight parking for motorhomes.\n\nThe police were polite but firm. They said the entire Algarve coast is being cracked down on and fines will increase.\n\nAlternatives I\'ve found:\n- The municipal aire in Lagos (€8/night, basic but legal)\n- A spot north of Aljezur that\'s still quiet (DM me for coords)\n- Several farms offering overnight parking through Homecamper\n\nStay safe out there!', category: 'wild-camping', reply_count: 1, pinned: 1 },
    { author: 'admin', title: 'Welcome to The Overland Post community!', slug: 'welcome-to-the-overland-post', content: 'Welcome everyone! This is the community forum for The Overland Post. Whether you\'re a full-time vanlifer, a weekend warrior, or still dreaming about converting your first van — you\'re in the right place.\n\n**Forum Guidelines:**\n- Be respectful and constructive\n- Share knowledge freely\n- Don\'t post exact coordinates of sensitive wild camping spots publicly (use DMs)\n- Commercial posts belong in Buy/Sell/Swap only\n- Report any issues to the mod team\n\nLooking forward to building this community with you all!', category: 'general', reply_count: 0, pinned: 1 },
    { author: 'marcoroutes', title: 'LPG vs diesel heater — what\'s your preference?', slug: 'lpg-vs-diesel-heater-preference', content: 'Starting to plan our heating setup for winter. We\'re torn between:\n\n**LPG (gas)**\n- Pros: Instant heat, can also cook with it, no install complexity\n- Cons: Condensation issues, gas bottle storage, refilling in some countries is awkward\n\n**Diesel (Webasto/Chinese clone)**\n- Pros: Dry heat, uses van\'s fuel tank, very efficient\n- Cons: Installation complexity, can be noisy, needs regular servicing\n\nWhat are you running and what would you choose again?', category: 'mechanical', reply_count: 0, pinned: 0 },
];

for (const fp of forumPosts) {
    const existing = db.prepare('SELECT id FROM forum_posts WHERE slug = ?').get(fp.slug);
    if (!existing) {
        db.prepare(`INSERT INTO forum_posts (author_id, title, slug, content, category, reply_count, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(userIds[fp.author], fp.title, fp.slug, fp.content, fp.category, fp.reply_count, fp.pinned);
        console.log(`  Created forum post: ${fp.title}`);
    }
}

// ── Forum Replies ──────────────────────────────────────────────────────────────
// Add replies to some posts
const alpsPosts = db.prepare("SELECT id FROM forum_posts WHERE slug = 'best-mountain-passes-alps-vans'").get();
if (alpsPosts) {
    const existingReplies = db.prepare('SELECT COUNT(*) as count FROM forum_replies WHERE post_id = ?').get(alpsPosts.id).count;
    if (existingReplies === 0) {
        db.prepare('INSERT INTO forum_replies (post_id, author_id, content) VALUES (?, ?, ?)').run(
            alpsPosts.id, userIds['admin'], 'The Grossglockner High Alpine Road in Austria is absolutely spectacular and very van-friendly. Wide road, well maintained, and the views are incredible. Costs about €38 for the toll but worth every cent.\n\nFor wild camping, there are several car parks near the Edelweissspitze viewpoint where nobody seems to mind overnighters. Just be prepared for cold temperatures even in summer!\n\nI\'d also recommend the Furka and Grimsel passes in Switzerland — the road James Bond drove in Goldfinger. Free to drive, beautiful, and there are a few spots to park up near the Rhône glacier.'
        );
        db.prepare('INSERT INTO forum_replies (post_id, author_id, content) VALUES (?, ?, ?)').run(
            alpsPosts.id, userIds['sarahwheels'], 'Stelvio is doable but stressful in a big van — I did it in my Boxer (5.99m) and it was fine going up but terrifying on the hairpins coming down. Would recommend doing it early morning before the motorbike crowds arrive.\n\nMy personal favourite is the Transfăgărășan in Romania — technically not the Alps but it\'s the most incredible mountain road I\'ve ever driven. And Romania is incredibly cheap and welcoming for vanlifers.'
        );
        db.prepare('UPDATE forum_posts SET last_reply_at = CURRENT_TIMESTAMP WHERE id = ?').run(alpsPosts.id);
    }
}

const rustPost = db.prepare("SELECT id FROM forum_posts WHERE slug = 'rust-repair-before-conversion'").get();
if (rustPost) {
    const existingReplies = db.prepare('SELECT COUNT(*) as count FROM forum_replies WHERE post_id = ?').get(rustPost.id).count;
    if (existingReplies === 0) {
        db.prepare('INSERT INTO forum_replies (post_id, author_id, content) VALUES (?, ?, ?)').run(
            rustPost.id, userIds['admin'], '£1,200 for sills and arches on a Transit sounds about right. I\'d say **absolutely do it** if the rest of the van is solid. Consider this:\n\n- You\'ll spend £5,000-10,000+ on the conversion itself\n- A rust-free body protects that investment\n- Buying a "cleaner" van for the same money probably means higher mileage or other issues\n- Untreated rust always gets worse and will eventually become an MOT failure\n\nOne thing I\'d add: get them to treat the inside of the sills with Dinitrol/Waxoyl while they have them open. Future you will be grateful.'
        );
        db.prepare('UPDATE forum_posts SET last_reply_at = CURRENT_TIMESTAMP WHERE id = ?').run(rustPost.id);
    }
}

const lagosPost = db.prepare("SELECT id FROM forum_posts WHERE slug = 'warning-parking-enforcement-lagos-algarve'").get();
if (lagosPost) {
    const existingReplies = db.prepare('SELECT COUNT(*) as count FROM forum_replies WHERE post_id = ?').get(lagosPost.id).count;
    if (existingReplies === 0) {
        db.prepare('INSERT INTO forum_replies (post_id, author_id, content) VALUES (?, ?, ?)').run(
            lagosPost.id, userIds['marcoroutes'], 'Thanks for the warning Sarah. Same thing happened to us near Sagres last month. The whole western Algarve is getting much stricter.\n\nWe ended up heading north to the Alentejo coast — the area around Zambujeira do Mar and Porto Covo is still very relaxed. Beautiful beaches too, just a bit cooler and windier than the Algarve.'
        );
        db.prepare('UPDATE forum_posts SET last_reply_at = CURRENT_TIMESTAMP WHERE id = ?').run(lagosPost.id);
    }
}

// ── Campsites ──────────────────────────────────────────────────────────────────
const campsites = [
    { submitted_by: 'admin', name: 'Praia da Amoreira Car Park', description: 'Large gravel car park overlooking the river mouth at Amoreira beach. Quiet at night, beautiful sunsets. Small café nearby in summer. No services but village is 2km away.', latitude: 37.3555, longitude: -8.8474, country: 'Portugal', region: 'Alentejo', type: 'wild', cost_per_night: 0, has_water: 0, has_electric: 0, has_toilet: 0, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
    { submitted_by: 'admin', name: 'Aire de Camping-Car Honfleur', description: 'Official motorhome aire on the outskirts of Honfleur. Flat tarmac pitches, electricity, water, dump station. Walking distance to the beautiful old port. Gets busy in summer — arrive before 2pm.', latitude: 49.4197, longitude: 0.2296, country: 'France', region: 'Normandy', type: 'aire', cost_per_night: 12, currency: 'EUR', has_water: 1, has_electric: 1, has_toilet: 1, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
    { submitted_by: 'sarahwheels', name: 'Trollstigen Viewpoint Parking', description: 'Free parking at the top of the famous Trollstigen mountain road. Spectacular views, visitor centre with toilets. Can get windy overnight. Only accessible June-October.', latitude: 62.4575, longitude: 7.6641, country: 'Norway', region: 'Møre og Romsdal', type: 'parking', cost_per_night: 0, has_water: 0, has_electric: 0, has_toilet: 1, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
    { submitted_by: 'marcoroutes', name: 'Lago di Braies Stellplatz', description: 'Small official Stellplatz near the famous lake. Stunning Dolomite scenery. Limited to 20 vans. Electricity hookup available. Restaurant and shop at the lake.', latitude: 46.6942, longitude: 12.0855, country: 'Italy', region: 'South Tyrol', type: 'stellplatz', cost_per_night: 18, currency: 'EUR', has_water: 1, has_electric: 1, has_toilet: 1, has_shower: 1, has_wifi: 0, dog_friendly: 0 },
    { submitted_by: 'sarahwheels', name: 'Loch Lomond Forestry Track', description: 'Quiet forestry car park on the east side of Loch Lomond. Space for 3-4 vans. Beautiful morning mist over the loch. No services — nearest town is Drymen, 5 miles. Midges in summer!', latitude: 56.1238, longitude: -4.5598, country: 'Scotland', region: 'Stirling', type: 'wild', cost_per_night: 0, has_water: 0, has_electric: 0, has_toilet: 0, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
    { submitted_by: 'admin', name: 'Playa de las Catedrales Parking', description: 'Large free car park above the famous Cathedral Beach. Flat, quiet at night. Beach access via steps. The rock formations at low tide are incredible. Reservation needed to access beach in summer.', latitude: 43.5536, longitude: -7.1568, country: 'Spain', region: 'Galicia', type: 'parking', cost_per_night: 0, has_water: 0, has_electric: 0, has_toilet: 0, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
    { submitted_by: 'marcoroutes', name: 'Camping Hopfensee', description: 'Well-equipped campsite with direct lake access. Clean facilities, small shop, restaurant. Near Neuschwanstein Castle. Great base for exploring the Bavarian Alps.', latitude: 47.6032, longitude: 10.6849, country: 'Germany', region: 'Bavaria', type: 'campsite', cost_per_night: 28, currency: 'EUR', has_water: 1, has_electric: 1, has_toilet: 1, has_shower: 1, has_wifi: 1, dog_friendly: 1 },
    { submitted_by: 'jenbuilds', name: 'Cap Fréhel Car Park', description: 'Dramatic clifftop parking near the lighthouse. Views to Fort la Latte. Technically no overnight parking but rarely enforced outside July-August. Amazing sunsets.', latitude: 48.6840, longitude: -2.3136, country: 'France', region: 'Brittany', type: 'wild', cost_per_night: 0, has_water: 0, has_electric: 0, has_toilet: 1, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
    { submitted_by: 'sarahwheels', name: 'Preikestolen Base Camp', description: 'Paid parking at the base of the Pulpit Rock hike. Can stay overnight if you buy the 24h ticket. Clean toilet block. The hike starts right here — 4 hours return, one of Norway\'s best.', latitude: 58.9860, longitude: 6.1441, country: 'Norway', region: 'Rogaland', type: 'paid', cost_per_night: 15, currency: 'EUR', has_water: 1, has_electric: 0, has_toilet: 1, has_shower: 0, has_wifi: 0, dog_friendly: 0 },
    { submitted_by: 'admin', name: 'Praia do Guincho Viewpoint', description: 'Informal parking area above Guincho beach near Sintra. Popular with surfers and vanlifers. Can be very windy. The sunsets over the Atlantic are world-class. 30 min drive from Lisbon.', latitude: 38.7299, longitude: -9.4742, country: 'Portugal', region: 'Lisbon', type: 'wild', cost_per_night: 0, has_water: 0, has_electric: 0, has_toilet: 0, has_shower: 0, has_wifi: 0, dog_friendly: 1 },
];

for (const c of campsites) {
    const existingName = db.prepare('SELECT id FROM campsites WHERE name = ? AND latitude = ?').get(c.name, c.latitude);
    if (!existingName) {
        db.prepare(`INSERT INTO campsites (submitted_by, name, description, latitude, longitude, country, region, type, cost_per_night, currency, has_water, has_electric, has_toilet, has_shower, has_wifi, dog_friendly, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`)
            .run(userIds[c.submitted_by], c.name, c.description, c.latitude, c.longitude, c.country, c.region, c.type,
                c.cost_per_night, c.currency || 'EUR', c.has_water, c.has_electric, c.has_toilet, c.has_shower, c.has_wifi, c.dog_friendly);
        console.log(`  Created campsite: ${c.name}`);
    }
}

// ── Routes ─────────────────────────────────────────────────────────────────────
const routes = [
    {
        author: 'admin', title: 'The Wild Atlantic Way: Ireland\'s Epic Coastal Drive',
        slug: 'wild-atlantic-way-ireland',
        description: `The Wild Atlantic Way stretches 2,500 kilometres along Ireland's western coast, from the Inishowen Peninsula in Donegal to Kinsale in Cork. It's one of the longest defined coastal touring routes in the world and arguably the most beautiful.\n\n## The Route\n\nThe WAW passes through nine counties and some of the most dramatic coastal scenery in Europe. Towering cliffs, secluded beaches, ancient ruins, and some of the friendliest people you'll ever meet.\n\n## Highlights\n\n- **Cliffs of Moher** — Ireland's most visited natural attraction\n- **The Burren** — an otherworldly limestone landscape\n- **Connemara** — wild, boggy, and beautiful\n- **Slieve League** — cliffs three times higher than the Cliffs of Moher, but a fraction of the visitors\n- **The Skellig Ring** — the peninsula beyond the Ring of Kerry, where Star Wars was filmed\n\n## Van-Friendly Tips\n\n- Roads are narrow in many places — a shorter wheelbase van is an advantage\n- Wild camping is generally tolerated and there are hundreds of quiet spots\n- Fuel is expensive — budget €1.70-1.90/litre for diesel\n- The weather is... Irish. Bring waterproofs, enjoy the rainbows\n- Many car parks have height barriers at 2.1m`,
        country: 'Ireland', region: 'West Coast', distance_km: 2500, duration_days: 14,
        difficulty: 'moderate', best_season: 'May-September',
        waypoints: JSON.stringify([
            { lat: 55.38, lng: -7.38, name: 'Malin Head (Start)' },
            { lat: 54.63, lng: -8.62, name: 'Slieve League' },
            { lat: 53.80, lng: -9.94, name: 'Clifden, Connemara' },
            { lat: 52.97, lng: -9.43, name: 'Cliffs of Moher' },
            { lat: 52.18, lng: -10.45, name: 'Dingle Peninsula' },
            { lat: 51.77, lng: -10.45, name: 'Skellig Ring' },
            { lat: 51.70, lng: -8.53, name: 'Kinsale (Finish)' },
        ]),
        tags: 'coastal,ireland,scenic,wild-camping'
    },
    {
        author: 'marcoroutes', title: 'Dolomites Loop: 5 Passes in 5 Days',
        slug: 'dolomites-loop-five-passes',
        description: `A circular route through the heart of the Italian Dolomites, crossing five spectacular mountain passes. This is driving at its finest — dramatic pinnacles, green valleys, and switchback roads that will test your clutch control.\n\n## The Passes\n\n1. **Passo Gardena (2,121m)** — gentle start with great views of the Sella group\n2. **Passo Sella (2,240m)** — iconic views of Sassolungo\n3. **Passo Pordoi (2,239m)** — the highest surfaced pass in the Dolomites\n4. **Passo Falzarego (2,105m)** — gateway to the Cinque Torri\n5. **Passo Giau (2,236m)** — the hidden gem, fewer tourists, incredible scenery\n\n## Practical Info\n\n- All passes are open June to October (weather dependent)\n- Free to drive — no tolls\n- Several Stellplatz and paid motorhome areas along the route\n- Wild camping is illegal in South Tyrol but some car parks are tolerated\n- Fuel up in the valleys — prices are higher at altitude\n- 3.5t limit on all passes, heights generally fine for standard vans`,
        country: 'Italy', region: 'South Tyrol', distance_km: 180, duration_days: 5,
        difficulty: 'challenging', best_season: 'June-October',
        waypoints: JSON.stringify([
            { lat: 46.56, lng: 11.77, name: 'Passo Gardena' },
            { lat: 46.50, lng: 11.76, name: 'Passo Sella' },
            { lat: 46.49, lng: 11.81, name: 'Passo Pordoi' },
            { lat: 46.52, lng: 12.01, name: 'Passo Falzarego' },
            { lat: 46.48, lng: 12.06, name: 'Passo Giau' },
        ]),
        tags: 'mountains,dolomites,italy,passes,challenging'
    },
];

for (const r of routes) {
    const existing = db.prepare('SELECT id FROM routes WHERE slug = ?').get(r.slug);
    if (!existing) {
        db.prepare(`INSERT INTO routes (author_id, title, slug, description, country, region, distance_km, duration_days, difficulty, best_season, waypoints, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(userIds[r.author], r.title, r.slug, r.description, r.country, r.region, r.distance_km, r.duration_days, r.difficulty, r.best_season, r.waypoints, r.tags);
        console.log(`  Created route: ${r.title}`);
    }
}

// ── Build ──────────────────────────────────────────────────────────────────────
const buildExisting = db.prepare("SELECT id FROM builds WHERE slug = 'rusty-the-transit-full-conversion'").get();
if (!buildExisting) {
    const buildResult = db.prepare(`INSERT INTO builds (owner_id, title, slug, description, base_vehicle, year, status, total_cost, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userIds['jenbuilds'], 'Rusty the Transit: Full Conversion', 'rusty-the-transit-full-conversion',
            'Documenting our full conversion of a 2017 Ford Transit L4H3 from empty panel van to our full-time home. We\'re doing everything ourselves with no prior experience — following YouTube, forums, and a lot of trial and error.',
            'Ford Transit L4H3', 2017, 'in-progress', 4500, 'GBP');

    const buildId = buildResult.lastInsertRowid;

    const entries = [
        { title: 'Stripping out and rust treatment', content: 'Spent the entire first weekend stripping out the ply lining, removing the bulkhead, and treating every spot of surface rust we could find. Used Kurust on minor spots and had a mobile welder repair two small holes in the floor.\n\nTip: wear a proper mask when grinding — the dust is horrible.', cost: 85, hours: 16, order: 1 },
        { title: 'Insulation: Floor, walls, and ceiling', content: 'After much debate (and reading approximately 400 forum threads), we went with:\n\n- **Floor:** 25mm PIR board between battens, then 9mm ply\n- **Walls:** Thermawrap + 25mm PIR in the panel gaps\n- **Ceiling:** 50mm PIR between the ribs, Thermawrap as VCL\n\nTotal insulation cost was about £350. The floor took a full day, walls and ceiling another two days.\n\nBiggest lesson: measure everything three times. Our first floor panel was 5mm too wide and we had to recut it.', cost: 350, hours: 24, order: 2 },
        { title: 'Electrical system: 200Ah lithium + 300W solar', content: 'The big one. We went with a 200Ah LiFePO4 battery from Fogstar, a Victron MPPT charge controller, and a 300W Renogy panel on the roof.\n\nWiring diagram available on our blog. Key components:\n- 200Ah Fogstar Drift battery\n- Victron SmartSolar 100/30 MPPT\n- 300W Renogy mono panel\n- Sterling B2B 30A charger\n- Victron BMV-712 battery monitor\n- 12-way fuse box from 12V Planet\n\nThis was the most intimidating part of the build but honestly, if you take it step by step and label everything, it\'s very logical.', cost: 1800, hours: 20, order: 3 },
    ];

    for (const e of entries) {
        db.prepare('INSERT INTO build_entries (build_id, title, content, cost, hours_spent, entry_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(buildId, e.title, e.content, e.cost, e.hours, e.order);
    }
    console.log('  Created build: Rusty the Transit');
}

// ── Add some reviews to campsites ──────────────────────────────────────────────
const amoreiraCampsite = db.prepare("SELECT id FROM campsites WHERE name = 'Praia da Amoreira Car Park'").get();
if (amoreiraCampsite) {
    const existingReview = db.prepare('SELECT id FROM campsite_reviews WHERE campsite_id = ? AND user_id = ?').get(amoreiraCampsite.id, userIds['sarahwheels']);
    if (!existingReview) {
        db.prepare('INSERT INTO campsite_reviews (campsite_id, user_id, rating, comment, visited_date) VALUES (?, ?, ?, ?, ?)')
            .run(amoreiraCampsite.id, userIds['sarahwheels'], 5, 'One of my favourite spots in Portugal. The sunset over the river mouth is magical. Very quiet even in July. Would live here permanently if I could.', '2025-07-15');
        db.prepare('INSERT INTO campsite_reviews (campsite_id, user_id, rating, comment, visited_date) VALUES (?, ?, ?, ?, ?)')
            .run(amoreiraCampsite.id, userIds['marcoroutes'], 4, 'Beautiful spot but the road down is quite rough — take it slow. No shade at all so very hot in summer. Bring extra water.', '2025-08-02');

        const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM campsite_reviews WHERE campsite_id = ?').get(amoreiraCampsite.id);
        db.prepare('UPDATE campsites SET rating_avg = ?, rating_count = ? WHERE id = ?').run(stats.avg, stats.count, amoreiraCampsite.id);
    }
}

console.log('Seed complete!');
console.log('\nDefault login credentials:');
console.log('  Admin:     admin / admin123');
console.log('  Moderator: moderator / mod123');
console.log('  User:      sarahwheels / password123');
db.close();
