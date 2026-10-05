// Mirrors the exact rules the customer storefront (src/pages/ServiceDetail.jsx)
// uses to decide which booking experience a subcategory's services render
// with. A subcategory can force the picker via its `booking_behavior`
// ("Booking style" in the subcategory editor); when it's NULL/'auto' the
// storefront falls back to inferring it from service/category/subcategory
// names and the `duration` string — so this previews both paths before
// saving, instead of discovering it live on the site.
//
// IMPORTANT: if the detection rules in ServiceDetail.jsx (HOUSE_RE,
// MOVE_OUT_RE, WEEKLY_RE, MULTI_SELECT_GROUPS, the office/wellness/cleaning
// category regexes, is_picker_option handling, or the duration-picker logic)
// ever change, update this file too.

export type PreviewMode =
  | 'multi_select'
  | 'house_cleaning'
  | 'office_cleaning'
  | 'wellness_session'
  | 'room_type'
  | 'duration_list'
  | 'simple_list';

export type PreviewSibling = {
  id?: number;
  name: string;
  duration: string | null;
  isPickerOption?: boolean;
};

export type BehaviorPreview = {
  mode: PreviewMode;
  label: string;
  detail: string;
  warning?: string;
  /** Whether the service currently being added/edited (passed as
   * `currentIndex`) will itself be reachable through this picker at all —
   * some modes (house_cleaning) silently drop siblings whose name doesn't
   * match, rather than erroring. */
  currentServiceVisible: boolean;
  currentServiceNote?: string;
};

export const HOUSE_RE = /^one-time cleaning\b/i;
const MOVE_OUT_RE = /move[\s-]?out/i;
const WEEKLY_RE = /^(\d+(?:\.\d+)?)\s*Hours?\/Visit\s*-\s*(\d+)\s*Times?\s+per\s+Week$/i;
const MULTI_SELECT_GROUPS = new Set(['heena art', 'threading', 'waxing', 'waxing & threading']);

export function parseDurationMinutes(str: string | null | undefined): number | null {
  const s = String(str || '').toLowerCase();
  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes|m)/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n)) return n < 20 ? Math.round(n * 60) : Math.round(n);
  return null;
}

export function formatHours(minutes: number) {
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hr`;
}

/**
 * `siblings` should be every service that will share this subcategory once
 * saved — the catalog's existing rows in that subcategory, plus the one
 * currently being added/edited with its in-progress name/duration.
 * `currentIndex` is that service's position in `siblings`, so the preview can
 * tell you specifically whether *that* service will be reachable on the
 * storefront, not just what the subcategory as a whole renders as.
 */
export function previewBookingBehavior(
  categoryName: string,
  subcategoryName: string,
  bookingBehavior: string | null | undefined,
  siblings: PreviewSibling[],
  currentIndex: number
): BehaviorPreview {
  const subKey = subcategoryName.trim().toLowerCase();
  const current = siblings[currentIndex];
  const explicit = bookingBehavior && bookingBehavior !== 'auto' ? bookingBehavior : null;
  // The house/office cleaning pickers only exist under the cleaning
  // categories ("Cleaning", "Office Cleaning") — same /cleaning/i gate as
  // ServiceDetail.jsx's `cleaningCategory`.
  const isCleaning = /cleaning/i.test(categoryName);

  // An explicit Booking style on the subcategory wins outright — the
  // storefront skips every name rule except the house_cleaning fallback
  // below (same precedence as ServiceDetail.jsx's `explicit` checks).
  if (explicit && explicit !== 'house_cleaning' && explicit !== 'office_cleaning') {
    const forced: Record<string, BehaviorPreview> = {
      multi_select: {
        mode: 'multi_select',
        label: 'Multi-select',
        detail: 'Forced by this subcategory\u2019s Booking style — customers can tick more than one service for the same visit, instead of picking just one.',
        currentServiceVisible: true,
      },
      room_type: {
        mode: 'room_type',
        label: 'Unit / room type list',
        detail: 'Forced by this subcategory\u2019s Booking style — a plain list labelled by unit type rather than duration.',
        currentServiceVisible: true,
      },
      duration_list: {
        mode: 'duration_list',
        label: 'Duration picker',
        detail: 'Forced by this subcategory\u2019s Booking style — every service becomes an option labelled by its Duration, so give each one a parseable value (e.g. "45 min", "2 hrs").',
        currentServiceVisible: true,
        currentServiceNote: current && !parseDurationMinutes(current.duration)
          ? 'This service\u2019s Duration isn\u2019t parseable, so its option label will be blank or wrong.'
          : undefined,
      },
      wellness_session: {
        mode: 'wellness_session',
        label: 'Wellness session picker',
        detail: 'Forced by this subcategory\u2019s Booking style — every service becomes a duration pill, plus one-time / monthly / fortnightly / weekly cadence plans.',
        currentServiceVisible: true,
        currentServiceNote: current && !parseDurationMinutes(current.duration)
          ? 'This service\u2019s Duration isn\u2019t parseable (e.g. "45 min"), so its pill will show blank or wrong.'
          : undefined,
      },
      simple_list: {
        mode: 'simple_list',
        label: 'Simple list',
        detail: 'Forced by this subcategory\u2019s Booking style — a plain list sorted by price; no name rules apply.',
        currentServiceVisible: true,
      },
    };
    const result = forced[explicit];
    if (result) return result;
  }

  // A cleaning picker set on a non-cleaning category is ignored by the
  // storefront — it falls through to a plain list.
  if ((explicit === 'house_cleaning' || explicit === 'office_cleaning') && !isCleaning) {
    return {
      mode: 'simple_list',
      label: 'Simple list',
      detail: `Booking style is "${explicit === 'house_cleaning' ? 'House cleaning picker' : 'Office cleaning'}", which only applies under the Cleaning / Office Cleaning categories — under "${categoryName || 'this category'}" the storefront ignores it and shows a plain list.`,
      warning: 'This booking style only works under a cleaning category.',
      currentServiceVisible: true,
    };
  }

  if (explicit === 'office_cleaning') {
    return {
      mode: 'office_cleaning',
      label: 'Office cleaning picker',
      detail: 'Forced by this subcategory\u2019s Booking style — office size/plan picker with contract-style recurring pricing, priced from this subcategory\u2019s “Office pricing” settings (built-in tables when unset).',
      currentServiceVisible: true,
    };
  }

  if (explicit === 'house_cleaning') {
    // Flagged rows are the hour options; with none flagged the storefront
    // falls back to the "One-Time Cleaning" name rule (same as 'auto').
    const flagged = siblings
      .map((s, i) => ({ s, i, hours: (parseDurationMinutes(s.duration) || 0) / 60 }))
      .filter((o) => o.s.isPickerOption && o.hours > 0)
      .sort((a, b) => a.hours - b.hours);
    if (flagged.length > 1) {
      const currentIsOption = flagged.some((o) => o.i === currentIndex);
      return {
        mode: 'house_cleaning',
        label: 'House cleaning picker',
        detail: `Home-size + hours + cleaners picker with recurring plans. Hour options: ${flagged
          .map((o) => formatHours(o.hours * 60))
          .join(', ')}.`,
        currentServiceVisible: currentIsOption,
        currentServiceNote: currentIsOption
          ? undefined
          : 'This service isn\u2019t ticked as an "Hours option", so it will NOT appear in this subcategory\u2019s picker — only flagged services become the "Hours per visit" pills. Tick it below if it should be one.',
      };
    }
    if (flagged.length === 1) {
      return {
        mode: 'simple_list',
        label: 'Simple list (incomplete house-cleaning set)',
        detail: 'Only one service is ticked as an "Hours option". The storefront needs at least two flagged services to activate the home-size/hours/cleaners picker — until then this renders as a plain list.',
        warning: 'Tick "Hours option" on a second service (with a different duration) to activate the house-cleaning picker.',
        currentServiceVisible: true,
      };
    }
    // Zero flagged: the storefront falls back to the "One-Time Cleaning"
    // name rule only — not the other pickers — so check that here rather
    // than letting this run the full auto inference below.
    const byName = siblings
      .map((s, i) => ({ s, i, hours: (parseDurationMinutes(s.duration) || 0) / 60 }))
      .filter((o) => HOUSE_RE.test(o.s.name) && o.hours > 0)
      .sort((a, b) => a.hours - b.hours);
    if (byName.length > 1) {
      const currentIsOption = byName.some((o) => o.i === currentIndex);
      return {
        mode: 'house_cleaning',
        label: 'House cleaning picker',
        detail: `Home-size + hours + cleaners picker with recurring plans. No services are flagged as "Hours option", so the picker fell back to name-matching: ${byName
          .map((o) => formatHours(o.hours * 60))
          .join(', ')}.`,
        currentServiceVisible: currentIsOption,
        currentServiceNote: currentIsOption
          ? 'This shows via its "One-Time Cleaning" name, not a flag — ticking "Hours option" is the supported way going forward.'
          : 'This service is neither flagged as an "Hours option" nor named "One-Time Cleaning ...", so it will NOT appear on the storefront for this subcategory.',
      };
    }
    return {
      mode: 'simple_list',
      label: 'Simple list (incomplete house-cleaning set)',
      detail: 'This subcategory is set to the house-cleaning picker, but nothing qualifies yet — tick "Hours option" on at least two services (each with a distinct, parseable duration), or fall back on the "One-Time Cleaning X hr" naming convention.',
      warning: 'Add two hour options to activate the picker.',
      currentServiceVisible: true,
    };
  }

  if (MULTI_SELECT_GROUPS.has(subKey)) {
    return {
      mode: 'multi_select',
      label: 'Multi-select',
      detail: 'Customers can tick more than one service in this subcategory for the same visit (e.g. threading + waxing), instead of picking just one.',
      currentServiceVisible: true,
    };
  }

  const houseOptions = siblings
    .map((s, i) => ({ s, i, hours: (parseDurationMinutes(s.duration) || 0) / 60 }))
    .filter((o) => HOUSE_RE.test(o.s.name) && o.hours > 0)
    .sort((a, b) => a.hours - b.hours);

  // The "One-Time Cleaning" name rule only fires under a cleaning category.
  if (isCleaning && houseOptions.length > 1) {
    const currentIsOption = houseOptions.some((o) => o.i === currentIndex);
    return {
      mode: 'house_cleaning',
      label: 'House cleaning picker',
      detail: `Home-size + hours + cleaners picker with recurring plans. Hour options: ${houseOptions
        .map((o) => formatHours(o.hours * 60))
        .join(', ')}.`,
      currentServiceVisible: currentIsOption,
      currentServiceNote: currentIsOption
        ? undefined
        : 'This service\u2019s name doesn\u2019t start with "One-Time Cleaning", so it will NOT appear anywhere on the storefront for this subcategory \u2014 the house-cleaning picker only shows its "One-Time Cleaning X hr" siblings. Also note: the "Size of your home" buttons (Studio/1BR/2BR/3BR/4BR+) are a fixed list in the storefront code, not read from the catalog \u2014 no service name or duration can add a new size option there.',
    };
  }
  if (isCleaning && houseOptions.length === 1) {
    const currentIsOption = houseOptions.some((o) => o.i === currentIndex);
    return {
      mode: 'simple_list',
      label: 'Simple list (incomplete house-cleaning set)',
      detail: 'Only one service here is named "One-Time Cleaning ...". The storefront needs at least two (each a different duration) to activate the home-size/hours/cleaners picker — until then this renders as a plain list.',
      warning: 'Add another "One-Time Cleaning X hr" service with a different duration to activate the house-cleaning picker.',
      currentServiceVisible: true,
      currentServiceNote: currentIsOption
        ? 'This is the one "One-Time Cleaning" service here \u2014 it shows up in the plain list for now, and will switch into the hours picker once a second one exists.'
        : undefined,
    };
  }

  if (/office cleaning/i.test(categoryName)) {
    return {
      mode: 'office_cleaning',
      label: 'Office cleaning picker',
      detail: 'Office size/plan picker with contract-style recurring pricing, priced from the subcategory\u2019s “Office pricing” settings (built-in tables when unset) \u2014 not read from this service\u2019s name or duration.',
      currentServiceVisible: true,
    };
  }

  if (/wellness/i.test(categoryName)) {
    const mins = parseDurationMinutes(current?.duration ?? null);
    return {
      mode: 'wellness_session',
      label: 'Wellness session picker',
      detail: 'Every service in this subcategory becomes a duration pill, plus one-time / monthly / fortnightly / weekly cadence plans.',
      currentServiceVisible: true,
      currentServiceNote: mins
        ? undefined
        : 'This service\u2019s Duration isn\u2019t set to something parseable (e.g. "45 min"), so its pill will show blank or wrong.',
    };
  }

  if (MOVE_OUT_RE.test(subcategoryName)) {
    return {
      mode: 'room_type',
      label: 'Unit / room type list',
      detail: 'Plain list labelled by unit type (e.g. "2BR (600-799 sqft)") instead of by duration. Triggered because the subcategory name contains "move-out".',
      currentServiceVisible: true,
    };
  }

  const durations = siblings.map((s) => parseDurationMinutes(s.duration));
  const allParsed = durations.length > 0 && durations.every((d) => d !== null);
  const allDistinct = allParsed && new Set(durations).size === durations.length;
  if (allParsed && allDistinct) {
    return {
      mode: 'duration_list',
      label: 'Duration picker',
      detail: `Options sorted and labelled by length of visit: ${durations.map((d) => formatHours(d as number)).join(', ')}.`,
      currentServiceVisible: true,
    };
  }

  const weeklyCount = siblings.filter((s) => WEEKLY_RE.test(s.name)).length;
  const weeklyNote =
    weeklyCount > 0
      ? ` ${weeklyCount} of these ${weeklyCount === 1 ? 'is' : 'are'} named "X Hours/Visit - Y Times per Week" and will be pulled into their own hours \u00d7 times-per-week grid.`
      : '';
  const reason = !allParsed
    ? " (one or more services here don't have a duration the storefront can parse, e.g. \"2 hrs\")"
    : durations.length > 1
      ? ' (two or more services here share the same duration, so it can\u2019t become a duration picker)'
      : '';

  return {
    mode: 'simple_list',
    label: 'Simple list',
    detail: `Plain list sorted by price${reason}.${weeklyNote}`,
    currentServiceVisible: true,
  };
}
