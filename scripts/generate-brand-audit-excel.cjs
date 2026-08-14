const XLSX = require('../backend/db/node_modules/xlsx')
const path = require('path')

const outPath = path.join(__dirname, '..', 'Kynd_Brand_Website_Audit.xlsx')
const csvPath = path.join(__dirname, '..', 'Kynd_Brand_Website_Audit.csv')

const SPRINT_START = '2026-08-12'
const SPRINT_END = '2026-08-14'
const DAY1 = '2026-08-12'
const DAY2 = '2026-08-13'
const DAY3 = '2026-08-14'
const LAST_AUDITED = '2026-08-13'

const headers = [
  'Priority',
  'Phase',
  'Category',
  'Task',
  'Task Type',
  'Owner',
  'Start Date',
  'Deadline',
  'Status',
  'Brand Spec',
  'Current State',
  'Action Required',
  'Files / Areas Affected',
  'Notes',
]

// Owner key: Dev = engineering, Copy = copywriter (TBD), Design = design/assets, Product = business decision
const rows = [
  // Phase 1 — Design System
  ['P0', 1, 'Design System', 'Set primary brand color to Terracotta Clay', 'Dev', 'Dev', DAY1, DAY1, 'Done', '#A95F45', 'Terracotta used for CTAs sitewide', 'Complete — verify no pink remnants', 'tailwind.config.js, src/**/*.jsx', 'Completed in codebase'],
  ['P0', 1, 'Design System', 'Fix terracotta token hex value', 'Dev', 'Dev', DAY1, DAY1, 'Done', '#A95F45', '#A95F45 in all tailwind configs', 'Complete', 'tailwind.config.js, admin/, provider/', ''],
  ['P0', 1, 'Design System', 'Add Warm Grey for secondary text', 'Dev', 'Dev', DAY1, DAY1, 'Done', '#706B5E', 'text-warmgrey applied sitewide; no neutral-500/600 left', 'Complete', 'tailwind.config.js, all pages', 'Verified Aug 12 audit'],
  ['P0', 1, 'Design System', 'Add Light Stone color token', 'Dev', 'Dev', DAY1, DAY1, 'Done', '#DBCEC2', 'border-lightstone on cards, inputs, dividers sitewide', 'Complete', 'tailwind.config.js, components', ''],
  ['P1', 1, 'Design System', 'Use Dusty Rose as tertiary accent only', 'Design', 'Design', DAY2, DAY3, 'Done', '#C58A8A — sparingly', 'bg-dustyrose/15 on ValuePillars icon wells', 'Complete — keep usage decorative only', 'ValuePillars.jsx', ''],
  ['P0', 1, 'Design System', 'Load Sora ExtraBold for headings', 'Dev', 'Dev', DAY1, DAY1, 'Done', 'Sora for logo + large headings', 'font-heading on H1/H2 across customer, admin, provider apps', 'Complete', 'index.html, tailwind.config.js, components', ''],
  ['P1', 1, 'Design System', 'Align logo to brand wordmark', 'Design', 'Design', DAY2, DAY3, 'Done', 'Lowercase kynd in terracotta (Sora)', 'KyndWordmark in Header, Footer, auth pages; provider/admin use inline kynd', 'Align admin login to lowercase KyndWordmark component', 'KyndWordmark.jsx, Header.jsx, Footer.jsx, auth pages', 'logo.png no longer used in customer app'],
  ['P0', 1, 'Design System', 'Replace pink accent ramp with terracotta', 'Dev', 'Dev', DAY1, DAY1, 'Done', 'Terracotta accent ramp', 'accent-* remapped; zero accent-500 refs remain', 'Complete', 'tailwind.config.js, PhoneMockup.jsx', ''],

  // Phase 2 — Global UI
  ['P0', 2, 'Global UI', 'Swap all primary buttons to terracotta', 'Dev', 'Dev', DAY1, DAY1, 'Done', 'Terracotta rounded-full buttons', 'bg-terracotta on main CTAs', 'Verify admin + provider apps', 'Header, Hero, Services, Cart, Checkout, Login, Signup', 'Customer app largely done'],
  ['P0', 2, 'Global UI', 'Update link and nav hover states', 'Dev', 'Dev', DAY1, DAY1, 'Done', 'Terracotta hover/active', 'hover:text-terracotta in Header', 'Extend to Footer and inner pages', 'Header.jsx, Footer.jsx', ''],
  ['P0', 2, 'Global UI', 'Update form focus rings', 'Dev', 'Dev', DAY1, DAY2, 'Done', 'Terracotta tint focus', 'focus:ring-terracotta on Login, Signup, Checkout, Forgot/Reset, admin forms', 'Complete', 'Login.jsx, Checkout.jsx, ForgotPassword.jsx, ResetPassword.jsx, admin/', ''],
  ['P1', 2, 'Global UI', 'Standardize secondary text color', 'Dev', 'Dev', DAY2, DAY3, 'Done', 'Warm Grey #706B5E', 'text-warmgrey across customer, admin, provider apps', 'Complete', 'All pages and components', ''],
  ['P1', 2, 'Global UI', 'Standardize success/confirmed badges', 'Dev', 'Dev', DAY2, DAY3, 'In progress', 'Sage Green #7A8D72', 'Sage on Bookings, BookingDetail, provider cards; BookingConfirmed still accent-50', 'Switch BookingConfirmed success icon to bg-sage/15 text-sage', 'BookingConfirmed.jsx', 'Verify + failed states already use brand tokens'],
  ['P1', 2, 'Global UI', 'Update section backgrounds', 'Dev', 'Dev', DAY2, DAY3, 'Done', 'Warm Linen + Light Stone + Sage', 'bg-warmlinen sitewide; bg-sage on ValuePillars; bg-sage/15 on Steps', 'Complete', 'Steps.jsx, ValuePillars.jsx, ServiceDetail.jsx, Reviews.jsx', ''],
  ['P1', 2, 'Global UI', 'Finish PhoneMockup accent colors', 'Dev', 'Dev', DAY2, DAY2, 'Done', 'Terracotta headers throughout', 'All mockup screens use terracotta; no accent-500', 'Complete', 'PhoneMockup.jsx', ''],
  ['P1', 2, 'Global UI', 'Apply font-heading to all H1/H2', 'Dev', 'Dev', DAY2, DAY3, 'Done', 'Sora ExtraBold headings', 'font-heading on all major headings sitewide', 'Complete', 'Hero, Services, Steps, Stats, Reviews, page heroes', ''],

  // Phase 3 — Messaging (COPYWRITING)
  ['P0', 3, 'Messaging', 'DECIDE: Primary tagline', 'Copy', 'Dev (implemented)', DAY1, DAY1, 'Done', '"Trusted help for life\'s moments"', 'Live in Hero, DownloadCta, Footer, index.html title', 'Complete — product sign-off optional', 'Hero, DownloadCta, Footer, index.html title', 'Chose "Trusted help for life\'s moments" over "kindly done"'],
  ['P0', 3, 'Messaging', 'Write hero subcopy', 'Copy', 'Dev (implemented)', DAY1, DAY2, 'Done', '"Professional. Background-checked. Human."', 'Live in Hero.jsx subheadline', 'Complete', 'Hero.jsx', ''],
  ['P1', 3, 'Messaging', 'Write service detail taglines', 'Copy', 'Dev (implemented)', DAY2, DAY3, 'Done', 'Per-service e.g. "A cleaner home, more time for what matters."', 'taglineForService() in serviceTagline.js; used on Services + ServiceDetail', 'Complete — refine per-service if needed', 'ServiceDetail.jsx, serviceTagline.js, Services.jsx', ''],
  ['P1', 3, 'Messaging', 'Write value pillars section copy', 'Copy', 'Dev (implemented)', DAY2, DAY3, 'Done', 'Trusted · Kind · Professional · Human', 'ValuePillars.jsx live on homepage with headline + 4 pillars', 'Complete', 'ValuePillars.jsx, Home.jsx', ''],
  ['P1', 3, 'Messaging', 'Write hero trust badge copy', 'Copy', 'Dev (implemented)', DAY2, DAY2, 'Done', '"Every pro is verified and insured so you can feel at ease."', 'Trust strip live in Hero.jsx with ShieldCheck icon', 'Complete', 'Hero.jsx', ''],
  ['P1', 3, 'Messaging', 'Rewrite how-it-works steps copy', 'Copy', 'Dev (implemented)', DAY2, DAY3, 'Done', 'Book → Confirm → Relax', 'Steps.jsx updated with new titles + descriptions', 'Complete', 'Steps.jsx', ''],
  ['P2', 3, 'Messaging', 'Optional campaign headline', 'Copy', 'Dev (implemented)', DAY3, DAY3, 'Done', '"Life\'s better when you have the right help."', 'Used as ValuePillars section headline', 'Complete', 'ValuePillars.jsx', ''],
  ['P2', 3, 'Messaging', 'Write standards carousel slide copy', 'Copy', 'Copywriter — TBD', DAY3, DAY3, 'In progress', '4 story slides with stats + bullets', 'Placeholder "Replace this with..." body copy in Home.jsx carousel', 'Write final copy for 4 carousel slides', 'Home.jsx (StandardsCarousel)', 'UI + photos done; copy pending'],

  // Phase 4 — Homepage & Hero
  ['P1', 4, 'Homepage', 'Redesign hero layout', 'Dev', 'Dev', DAY2, DAY3, 'Done', 'Terracotta emphasis, search, trust badge', 'Two-column hero with search, CTAs, trust strip, lifestyle photo', 'Complete', 'Hero.jsx', ''],
  ['P1', 4, 'Homepage', 'Add location search input', 'Dev', 'Dev', DAY2, DAY3, 'Done', '"Where do you need help?" + pin + proceed', 'LocationSearch with autocomplete + Proceed button', 'Complete', 'Hero.jsx', ''],
  ['P1', 4, 'Homepage', 'Replace hero imagery', 'Design', 'Design', DAY2, DAY3, 'In progress', 'Warm lifestyle photo', 'Pro photos live in hero + carousel; hero-worker.png retired', 'Finalize carousel slide body copy; polish crops', 'public/images/people/, Hero.jsx, Home.jsx', ''],
  ['P2', 4, 'Homepage', 'Build value pillars section (UI)', 'Dev', 'Dev', DAY3, DAY3, 'Done', '4 pillars with icons', 'ValuePillars section live on homepage', 'Complete', 'Home.jsx, ValuePillars.jsx', ''],
  ['P2', 4, 'Homepage', 'Add aggregate rating to reviews', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'e.g. "4.9 from 236 reviews"', 'Shows "5.0 from 8 reviews" summary pill above cards', 'Complete — update when real review count grows', 'Reviews.jsx', ''],
  ['P2', 4, 'Homepage', 'Add scroll-reveal animations', 'Dev', 'Dev', DAY2, DAY3, 'Done', 'Fade-up on scroll for homepage sections', 'ScrollReveal wrapper on Services, Steps, Stats, ValuePillars, carousel, Reviews, FAQ, CTA', 'Complete', 'Home.jsx', 'Added Aug 13'],
  ['P2', 4, 'Homepage', 'Reorder homepage sections', 'Dev', 'Dev', DAY2, DAY3, 'Done', 'Logical story flow', 'Hero → Services → Steps → Stats → ValuePillars → Carousel → Reviews → FAQ → CTA', 'Complete', 'Home.jsx', 'Stats moved after Steps'],

  // Phase 5 — Services
  ['P1', 5, 'Services', 'Redesign service grid layout', 'Dev', 'Dev', DAY2, DAY3, 'Done', '2-col mobile / 3-4 col desktop cards', 'Card grid on home Services + pages/Services.jsx', 'Complete', 'Services.jsx (home), pages/Services.jsx', ''],
  ['P1', 5, 'Services', 'Add services search bar', 'Dev', 'Dev', DAY3, DAY3, 'Done', '"What can we help you with today?"', 'ServicesSearch with live filter on /services', 'Complete', 'pages/Services.jsx', ''],
  ['P2', 5, 'Services', 'Add service photography', 'Design', 'Design', DAY3, DAY3, 'Not started', 'Photo per category', 'Lucide icons only in service cards', 'Source service images per category', 'public/images/, services data', ''],

  // Phase 6 — Service Detail
  ['P1', 6, 'Service Detail', 'Full-width hero photo', 'Dev + Design', 'Dev + Design', DAY3, DAY3, 'In progress', 'Pro in terracotta uniform', 'Full-width hero layout live; falls back to icon when no svc.img', 'Add real photo assets per service', 'ServiceDetail.jsx', ''],
  ['P1', 6, 'Service Detail', 'Add Top Rated badge overlay', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Star + review count on image', 'Top Rated badge with star + rating on hero image', 'Complete', 'ServiceDetail.jsx', ''],
  ['P1', 6, 'Service Detail', 'Add trust indicator row', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Background Checked · Insured · Guaranteed', 'TrustRow with sage icons under hero', 'Complete', 'ServiceDetail.jsx', ''],
  ['P1', 6, 'Service Detail', 'Sticky bottom booking bar', 'Dev', 'Dev', DAY3, DAY3, 'Done', '"From $X/hr" + "Choose a time"', 'StickyBookingBar with pricing + Choose a time CTA', 'Complete', 'ServiceDetail.jsx', ''],

  // Phase 7 — Pro Selection
  ['P2', 7, 'Pro Selection', 'Build pro selection page/step', 'Dev', 'Dev', DAY3, DAY3, 'Not started', 'Select a pro with filters', 'No pro-picker on web', 'New flow if in scope', 'New page + routing', 'Product decision — out of 2-day sprint?'],
  ['P2', 7, 'Pro Selection', 'Add filter pills + Match me', 'Dev', 'Dev', DAY3, DAY3, 'Not started', 'Price · Availability · Top Rated + Match me', 'N/A', 'Part of pro selection', 'Pro selection component', 'Post-sprint'],

  // Phase 8 — Auth
  ['P1', 8, 'Auth', 'Update customer login/signup branding', 'Dev', 'Dev', DAY2, DAY2, 'Done', 'Terracotta submit, Sora wordmark', 'KyndWordmark + terracotta buttons + focus rings on all auth pages', 'Complete', 'Login.jsx, Signup.jsx, ForgotPassword.jsx, ResetPassword.jsx', ''],
  ['P2', 8, 'Auth', 'Update admin login/signup branding', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Same brand tokens', 'Login + Signup: warmlinen bg, lowercase kynd wordmark, terracotta CTA, warmgrey, focus rings', 'Complete — optional KyndWordmark component swap later', 'admin/src/pages/Login.jsx, Signup.jsx', 'Verified Aug 13'],
  ['P2', 8, 'Auth', 'Update provider login branding', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Same brand tokens', 'Inline lowercase kynd wordmark, terracotta CTA, warm linen bg', 'Complete', 'provider/src/pages/Login.jsx', ''],

  // Phase 9 — Provider Dashboard
  ['P2', 9, 'Provider Dashboard', 'Rebuild dashboard layout', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Sidebar, metrics, chart', 'Full dashboard with sections, mobile drawer, tab bar', 'Complete', 'provider/src/pages/Dashboard.jsx', ''],
  ['P2', 9, 'Provider Dashboard', 'Add sidebar + metric cards + chart', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Per brand mockup', 'Sidebar, MetricCard, TrendChart, BookingCard all live', 'Complete', 'provider/src/components/', ''],

  // Phase 10 — Admin
  ['P2', 10, 'Admin', 'Apply brand design system to admin panel', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Terracotta, Sora, warm linen', 'AdminPanel uses terracotta, font-heading, warmgrey, sage status badges', 'Complete', 'admin/src/', ''],

  // Phase 11 — Assets
  ['P1', 11, 'Assets', 'Add lifestyle hero photography', 'Design', 'Design', DAY2, DAY3, 'In progress', 'Warm domestic settings', '6 pro photos in public/images/people/; used in hero + carousel', 'Finalize crops; carousel copy still placeholder', 'public/images/people/, Hero.jsx, Home.jsx', ''],
  ['P2', 11, 'Assets', 'Add service category images', 'Design', 'Design', DAY3, DAY3, 'Not started', 'Photo per service', 'Lucide icons only', 'Source imagery per service category', 'public/images/, services data', ''],
  ['P1', 11, 'Assets', 'Export logo variants (terracotta + white)', 'Design', 'Design', DAY2, DAY2, 'Done', 'Wordmark from brand kit', 'KyndWordmark component (color/white/dark variants); logo.png retired', 'Complete', 'KyndWordmark.jsx, Header.jsx, Footer.jsx', 'Text-based wordmark — no PNG export needed'],

  // Phase 12 — Minor
  ['P2', 12, 'Minor', 'Fix footer placeholder links', 'Product', 'Product — TBD', DAY3, DAY3, 'Done', 'Real URLs', 'mailto: careers links + /support route for locality request', 'Complete', 'Footer.jsx', ''],
  ['P2', 12, 'Minor', 'Align market/currency', 'Product', 'Product — TBD', DAY1, DAY2, 'Blocked', 'kynd.sg / S$ pricing', 'S$ pricing + SG hero cities; FAQ/Support use +91 phone + 15 Indian cities; Reviews show India sectors', 'Confirm SG vs India market; align phone, cities, reviews', 'Services API, cities data, Reviews.jsx, FAQ.jsx, Support.jsx', '⚠️ BUSINESS DECISION'],
  ['P3', 12, 'Minor', 'Update native app status bar color', 'Dev', 'Dev', DAY3, DAY3, 'Done', 'Warm Linen #F5F1EA', 'StatusBar background #F5F1EA on Android in native.js', 'Complete', 'src/native.js', ''],
  ['P3', 12, 'Minor', 'Align contact email/domain', 'Product', 'Product — TBD', DAY2, DAY3, 'Done', 'kynd.sg in brand kit', 'help@kynd.sg sitewide: Footer, Support, Legal, FAQ, DeleteAccount', 'Complete', 'Footer, Support, Legal, FAQ, DeleteAccount', 'Verified Aug 13'],
]

const sprintSummary = [
  ['Kynd Brand Sprint — 2-Day Timeline'],
  [''],
  ['Sprint Start', SPRINT_START],
  ['Sprint End (hard deadline)', SPRINT_END],
  ['Last Audited', LAST_AUDITED],
  ['Days Remaining', '1 day'],
  [''],
  ['Status Summary'],
  ['Done', rows.filter(r => r[8] === 'Done').length],
  ['In Progress', rows.filter(r => r[8] === 'In progress').length],
  ['Not Started', rows.filter(r => r[8] === 'Not started').length],
  ['Blocked', rows.filter(r => r[8] === 'Blocked').length],
  [''],
  ['Remaining Work (high level)'],
  ['1', 'Service category photography (icons still used)'],
  ['2', 'Standards carousel placeholder copy in Home.jsx'],
  ['3', 'BookingConfirmed sage success icon'],
  ['4', 'Market/currency alignment (SG vs India) — BLOCKED on product'],
  ['5', 'Pro selection flow — post-sprint / product decision'],
  [''],
  ['Completed Since Last Audit (Aug 12)'],
  ['✓', 'Admin login/signup full brand tokens'],
  ['✓', 'Homepage scroll-reveal animations'],
  ['✓', 'Homepage section reorder (Stats after Steps)'],
  ['✓', 'Sage green section backgrounds (ValuePillars, Steps)'],
  ['✓', 'help@kynd.sg aligned across Support, Legal, FAQ, DeleteAccount'],
  ['✓', 'BookingConfirmed page brand token polish'],
  [''],
  ['Copywriting Status'],
  ['Owner', 'Dev implemented core copy; carousel slides still need final copy'],
  ['Copy tasks count', rows.filter(r => r[4] === 'Copy').length],
  ['Copy tasks done', rows.filter(r => r[4] === 'Copy' && r[8] === 'Done').length],
  ['Copy tasks in progress', rows.filter(r => r[4] === 'Copy' && r[8] === 'In progress').length],
  [''],
  ['Owner Guide'],
  ['Dev', 'Engineering — BookingConfirmed sage badge, minor polish'],
  ['Copywriter — TBD', 'Carousel slide copy (4 slides)'],
  ['Design', 'Service category photos; hero/carousel photo polish'],
  ['Product — TBD', 'Market/currency decision (SG vs India)'],
]

const copyTasks = [
  ['Deadline', 'Task', 'Owner', 'Status', 'Deliverable', 'Blocks'],
  [DAY1, 'DECIDE: Primary tagline', 'Dev (implemented)', 'Done', '"Trusted help for life\'s moments" live sitewide', '—'],
  [DAY2, 'Write hero subcopy', 'Dev (implemented)', 'Done', '"Professional. Background-checked. Human." in Hero', '—'],
  [DAY2, 'Write hero trust badge copy', 'Dev (implemented)', 'Done', 'Verified & insured trust line in Hero', '—'],
  [DAY3, 'Write value pillars section copy', 'Dev (implemented)', 'Done', 'Headline + 4 pillar titles + descriptions', '—'],
  [DAY3, 'Rewrite how-it-works steps copy', 'Dev (implemented)', 'Done', 'Book → Confirm → Relax (3 steps)', '—'],
  [DAY3, 'Write service detail taglines', 'Dev (implemented)', 'Done', 'Per-category taglines in serviceTagline.js', '—'],
  [DAY3, 'Optional campaign headline', 'Dev (implemented)', 'Done', 'Used in ValuePillars headline', '—'],
  [DAY3, 'Write standards carousel slide copy', 'Copywriter — TBD', 'In progress', '4 slide body paragraphs in Home.jsx carousel', 'StandardsCarousel final polish'],
]

const alreadyAligned = [
  ['Item', 'Brand Spec', 'Current State', 'Status'],
  ['Warm Linen background', '#F5F1EA', 'Used sitewide + native status bar', 'Done'],
  ['Dark Charcoal text', '#2B2926', 'Global in index.css', 'Done'],
  ['Sage Green token', '#7A8D72', 'Success badges, trust icons, provider status', 'Done'],
  ['Plus Jakarta Sans body font', 'Body/UI font', 'Loaded and applied', 'Done'],
  ['Rounded UI components', '12-20px radii', 'Cards, buttons, inputs', 'Done'],
  ['Lucide thin-line icons', 'Stroke icons', 'Used throughout', 'Done'],
  ['App store badges', 'Store + Play badges', 'StoreButtons component', 'Done'],
  ['Dark charcoal footer', 'Dark footer', 'Footer.jsx with KyndWordmark white', 'Done'],
  ['Terracotta primary CTAs', '#A95F45', 'Customer, admin, provider apps', 'Done'],
  ['Pink accent removed', 'No #E91E63', 'Remapped to terracotta ramp; zero accent-500', 'Done'],
  ['Sora font + font-heading', 'Heading font', 'Applied on H1/H2 sitewide', 'Done'],
  ['KyndWordmark component', 'Lowercase kynd in Sora', 'Header, Footer, customer auth pages', 'Done'],
  ['Warm Grey secondary text', '#706B5E', 'text-warmgrey sitewide', 'Done'],
  ['Light Stone borders', '#DBCEC2', 'border-lightstone on cards/inputs', 'Done'],
  ['Hero location search', 'Where do you need help?', 'LocationSearch with autocomplete', 'Done'],
  ['Value pillars section', 'Trusted · Kind · Professional · Human', 'ValuePillars.jsx on homepage', 'Done'],
  ['Service taglines', 'Per-category copy', 'serviceTagline.js on Services + ServiceDetail', 'Done'],
  ['Service detail trust row', 'Background Checked · Insured · Guaranteed', 'TrustRow in ServiceDetail.jsx', 'Done'],
  ['Sticky booking bar', 'From price + Choose a time', 'StickyBookingBar in ServiceDetail.jsx', 'Done'],
  ['Provider dashboard', 'Sidebar, metrics, chart', 'Full rebuild with brand tokens', 'Done'],
  ['Reviews aggregate rating', 'e.g. 5.0 from N reviews', 'Summary pill in Reviews.jsx', 'Done'],
  ['Admin auth branding', 'Terracotta, Sora, warm linen', 'Login + Signup fully branded', 'Done'],
  ['Homepage scroll reveal', 'Fade-up on scroll', 'ScrollReveal on all sections below hero', 'Done'],
  ['Sage section backgrounds', 'ValuePillars + Steps', 'bg-sage and bg-sage/15 applied', 'Done'],
  ['Contact email kynd.sg', 'help@kynd.sg', 'Footer, Support, Legal, FAQ, DeleteAccount', 'Done'],
  ['BookingConfirmed branding', 'Brand tokens on confirm page', 'lightstone, warmgrey, terracotta CTAs', 'Partial'],
]

const colorPalette = [
  ['Token', 'HEX', 'Usage', 'Status', 'Notes'],
  ['Warm Linen', '#F5F1EA', 'Primary background', 'Done', 'Including native status bar'],
  ['Terracotta Clay', '#A95F45', 'Primary CTA, logo', 'Done', ''],
  ['Sage Green', '#7A8D72', 'Success, trust icons', 'Done', 'BookingConfirmed still uses accent — minor'],
  ['Dark Charcoal', '#2B2926', 'Primary text', 'Done', ''],
  ['Warm Grey', '#706B5E', 'Secondary text', 'Done', 'text-warmgrey sitewide'],
  ['Light Stone', '#DBCEC2', 'Borders, dividers', 'Done', 'border-lightstone sitewide'],
  ['Dusty Rose', '#C58A8A', 'Tertiary accent', 'Done', 'ValuePillars icon backgrounds only'],
]

const dayPlan = [
  ['Date', 'Focus', 'Key Deliverables', 'Owner', 'Status (Aug 13 audit)'],
  [DAY1, 'Foundation + decisions', 'Design tokens, tagline, logo wordmark', 'Dev + Product', 'Complete'],
  [DAY2, 'Copy + core UI', 'Hero, auth polish, font-heading, warmgrey, services grid', 'Dev + Design', 'Complete — carousel copy pending'],
  [DAY3, 'Launch polish', 'Service photos, market decision, sage badge, carousel copy', 'Dev + Design + Product', 'In progress — 1 day left'],
]

function sheetFromRows(data) {
  return XLSX.utils.aoa_to_sheet(data)
}

const wb = XLSX.utils.book_new()

const taskWs = sheetFromRows([headers, ...rows])
taskWs['!cols'] = [
  { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 16 },
  { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 35 }, { wch: 28 },
]
XLSX.utils.book_append_sheet(wb, taskWs, 'Task List')

XLSX.utils.book_append_sheet(wb, sheetFromRows(sprintSummary), 'Sprint Summary')
XLSX.utils.book_append_sheet(wb, sheetFromRows(copyTasks), 'Copywriting')
XLSX.utils.book_append_sheet(wb, sheetFromRows(dayPlan), '2-Day Plan')
XLSX.utils.book_append_sheet(wb, sheetFromRows(alreadyAligned), 'Already Done')
XLSX.utils.book_append_sheet(wb, sheetFromRows(colorPalette), 'Color Palette')

XLSX.writeFile(wb, outPath)

// CSV for easy Google Sheets import
const csvLines = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))]
require('fs').writeFileSync(csvPath, csvLines.join('\n'), 'utf8')

console.log('Created:', outPath)
console.log('Created:', csvPath)
console.log('Done:', rows.filter(r => r[8] === 'Done').length)
console.log('In progress:', rows.filter(r => r[8] === 'In progress').length)
console.log('Not started:', rows.filter(r => r[8] === 'Not started').length)
console.log('Blocked:', rows.filter(r => r[8] === 'Blocked').length)
