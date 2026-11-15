/* =====================================================================
   CALENDAR — dates of the world (data/calendar.json).
   ---------------------------------------------------------------------
   A world date is an object: { year, month, day } (month = a month's name,
   day = a number). Month and day are optional: { year: 1341 } is a year,
   { year: 1693, month: 'Pholawal' } a month. Years count from the first
   year of the era (1 LF); before it come the Old Days, which have none.

       const cal = Athenaeum.makeCalendar(store.singletons.calendar);
       cal.format({ year: 1693, month: 'Pholawal', day: 7 })
                                          -> 'Eksten 7 Pholawal, 1693 LF'
       cal.format(d, { weekday: false })  -> '7 Pholawal, 1693 LF'
       cal.format(d, { era: false })      -> 'Eksten 7 Pholawal, 1693'
       cal.weekday(d)                     -> 'Eksten'
       cal.compare(a, b)                  -> < 0 when a comes first
       cal.check(d)                       -> '' or what is wrong with it
       cal.parse('Pemtasten 6 Pholawal, 1693LF') -> { year, month, day }
       cal.now(store)                     -> the year now (calendar.now, else
                                             the latest dated session)
       cal.season(d)                      -> { name, colour, day, of, index }
       cal.moons(d)                       -> [{ name, colour, phase, lit, full, isNew, toFull }]
       cal.occursOn(rec, d)               -> for a yearly date (a festival, an anniversary):
                                             0 = not that day, else the day of it (1, 2…)
   Seasons follow one another from the first day of the year; the last one
   takes what is left (a day fewer in a common year). A moon is full on its
   `full` date and every `cycle` days before and after it.
   Leap years: every `leap.every` years, counted from `leap.year` (a known
   leap year), `leap.month` has one day more. The week never restarts: the
   weekday of any date is counted from `anchor`, a date whose weekday is known.
   Used by the store (validation), the Scriptorium, the timeline and the
   dashboard. Loaded after data/schema.js, before scripts/core/store.js.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    function makeCalendar(def) {
        def = def || {};
        const months = (def.months || []).filter(m => m && m.name);
        const weekdays = (def.weekdays || []).filter(Boolean);
        const era = def.era || '';
        const leap = def.leap || {};
        const monthIndex = name => months.findIndex(m => m.name.toLowerCase() === String(name || '').toLowerCase());
        const set = v => v !== undefined && v !== null && v !== '';
        const isDate = d => !!d && typeof d === 'object' && set(d.year);

        function isLeap(year) {
            const every = Number(leap.every) || 0;
            if (!every || !leap.month || !set(leap.year)) return false;
            return (((year - leap.year) % every) + every) % every === 0;
        }
        function daysIn(year, month) {
            const i = typeof month === 'number' ? month : monthIndex(month);
            if (i < 0) return 0;
            const m = months[i];
            return (Number(m.days) || 0) + (isLeap(year) && monthIndex(leap.month) === i ? 1 : 0);
        }
        function daysInYear(year) {
            return months.reduce((n, m, i) => n + daysIn(year, i), 0);
        }

        // Days from 1 Arawal, 1 LF (= 0) to the date. Years are counted from 1;
        // a cache keeps each year's start.
        const yearStart = new Map([[1, 0]]);
        function startOf(year) {
            if (yearStart.has(year)) return yearStart.get(year);
            let n, y;
            if (year > 1) {
                y = year - 1;
                while (y > 1 && !yearStart.has(y)) y--;
                n = yearStart.get(y);
                for (; y < year; y++) { n += daysInYear(y); yearStart.set(y + 1, n); }
            } else {
                n = 0;
                for (y = 1; y > year; y--) { n -= daysInYear(y - 1); yearStart.set(y - 1, n); }
            }
            return yearStart.get(year);
        }
        function dayNumber(d) {
            const mi = Math.max(0, monthIndex(d.month));
            let n = startOf(Number(d.year));
            for (let i = 0; i < mi; i++) n += daysIn(Number(d.year), i);
            return n + (Number(d.day) || 1) - 1;
        }

        function weekday(d) {
            if (!isDate(d) || !set(d.month) || !set(d.day) || !weekdays.length) return '';
            const a = def.anchor || {};
            const ai = weekdays.indexOf(def.anchorWeekday);
            if (!isDate(a) || ai < 0 || check(d)) return '';
            const k = weekdays.length;
            return weekdays[(((dayNumber(d) - dayNumber(a) + ai) % k) + k) % k];
        }

        // '' when the date is fine, else what is wrong. { yearly: true }: a date
        // that comes back every year (month and day, no year), checked in a leap year
        function check(d, { yearly = false } = {}) {
            if (!d || typeof d !== 'object') return 'not a date';
            if (yearly) {
                if (!set(d.month) && !set(d.day)) return '';
                if (!set(d.month) || !set(d.day)) return 'a yearly date needs a month and a day';
                return check({ ...d, year: set(leap.year) ? Number(leap.year) : 1 });
            }
            if (!set(d.year)) return (set(d.month) || set(d.day)) ? 'a month or a day without a year' : '';
            if (!Number.isInteger(Number(d.year))) return `year “${d.year}” is not a whole number`;
            if (set(d.day) && !set(d.month)) return 'a day without a month';
            if (set(d.month) && monthIndex(d.month) < 0) return `“${d.month}” is not a month of the calendar`;
            if (set(d.day)) {
                const max = daysIn(Number(d.year), d.month);
                if (!Number.isInteger(Number(d.day)) || d.day < 1 || d.day > max) return `${d.month} ${d.year} has ${max} days, not ${d.day}`;
            }
            return '';
        }

        // Earlier first. A year alone comes before the dates of that year,
        // a month alone before the days of that month.
        function compare(a, b) {
            const key = d => [Number(d.year), set(d.month) ? monthIndex(d.month) : -1, set(d.day) ? Number(d.day) : 0];
            const x = key(a), y = key(b);
            for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
            return 0;
        }

        // { approx } adds "c."; options: weekday (default true), era (default true), year (default true)
        function format(d, { weekday: wd = true, era: withEra = true, year: withYear = true } = {}) {
            if (!isDate(d)) return '';
            const y = withYear ? `${d.year}${withEra && era ? ' ' + era : ''}` : '';
            let out;
            if (set(d.day) && set(d.month)) {
                const w = wd ? weekday(d) : '';
                out = `${w ? w + ' ' : ''}${d.day} ${months[monthIndex(d.month)] ? months[monthIndex(d.month)].name : d.month}${y ? ', ' + y : ''}`;
            } else if (set(d.month)) out = `${d.month}${y ? ' ' + y : ''}`;
            else out = y;
            return (d.approx ? 'c. ' : '') + out;
        }

        // A date written by hand: "Pemtasten 6 Pholawal, 1693LF", "Eksten 7, Pholawal 1693 LF",
        // "Pholawal 1693", "1341". A misspelt weekday is ignored (the weekday is worked out).
        function parse(text) {
            const s = String(text || '').trim();
            const yearM = /(-?\d{1,5})\s*(?:[A-Z]{1,3})?\s*$/.exec(s.replace(/[.,]/g, ' ').trim());
            if (!yearM) return null;
            const out = { year: Number(yearM[1]) };
            const words = s.replace(/[.,]/g, ' ').split(/\s+/);
            const month = words.find(w => monthIndex(w) >= 0);
            if (month) out.month = months[monthIndex(month)].name;
            const nums = words.map(w => /^\d{1,2}$/.test(w) ? Number(w) : null).filter(n => n !== null);
            if (month && nums.length) out.day = nums[0];
            return check(out) ? null : out;
        }

        // Day of the year: 0 = the first day of the first month
        const dayOfYear = d => dayNumber(d) - startOf(Number(d.year));

        const seasons = (def.seasons || []).filter(x => x && x.name);
        function season(d) {
            if (!isDate(d) || !set(d.month) || !seasons.length) return null;
            const doy = dayOfYear({ day: 1, ...d });
            const total = daysInYear(Number(d.year));
            let at = 0;
            for (let i = 0; i < seasons.length; i++) {
                const last = i === seasons.length - 1;
                const len = last ? total - at : Number(seasons[i].days) || 0;
                if (doy < at + len || last) return { name: seasons[i].name, colour: seasons[i].colour || '', index: i, day: doy - at + 1, of: len, left: at + len - doy - 1 };
                at += len;
            }
            return null;
        }

        const PHASES = ['Full', 'Waning gibbous', 'Last quarter', 'Waning crescent', 'New', 'Waxing crescent', 'First quarter', 'Waxing gibbous'];
        const moonDefs = (def.moons || []).filter(m => m && m.name && Number(m.cycle) > 0 && isDate(m.full) && set(m.full.month) && set(m.full.day));
        // p: 0 = full, .5 = new; lit: the part of the disc lit (0–1)
        function moons(d) {
            if (!isDate(d) || !set(d.month) || !set(d.day) || check(d)) return [];
            const n = dayNumber(d);
            return moonDefs.map(m => {
                const cyc = Number(m.cycle);
                const off = (((n - dayNumber(m.full)) % cyc) + cyc) % cyc;
                const p = off / cyc;
                const near = x => Math.abs(off - x) < 0.5 || Math.abs(off - x - cyc) < 0.5 || Math.abs(off - x + cyc) < 0.5;
                return {
                    name: m.name, colour: m.colour || '#e8e6f0', p,
                    lit: (1 + Math.cos(2 * Math.PI * p)) / 2,
                    phase: PHASES[Math.round(p * 8) % 8],
                    waning: p > 0 && p < 0.5,
                    full: near(0), isNew: near(cyc / 2),
                    toFull: Math.round((cyc - off) % cyc) || (near(0) ? 0 : cyc),
                    sinceFull: Math.round(off),
                };
            });
        }

        // A yearly date ({month, day}, plus `days` for a span) on a given day:
        // 0 = not on it, else which day of it (1 = the first)
        function occursOn(rec, d) {
            const on = rec && (rec.on || rec.date);
            if (!on || !set(on.month) || !set(on.day) || !isDate(d) || !set(d.month) || !set(d.day)) return 0;
            const length = Math.max(1, Number(rec.days) || 1);
            for (const y of [Number(d.year), Number(d.year) - 1]) {   // a span may start the year before
                const start = { year: y, month: on.month, day: on.day };
                if (check(start)) continue;   // Arawal 32 in a common year
                const k = dayNumber(d) - dayNumber(start);
                if (k >= 0 && k < length) return k + 1;
            }
            return 0;
        }

        // The year now: calendar.now, else the latest dated session
        function now(store) {
            if (isDate(def.now)) return def.now;
            const dated = store ? store.all('session').map(s => s.date).filter(isDate) : [];
            return dated.sort(compare).pop() || null;
        }

        return {
            def, months, weekdays, era, eraName: def.eraName || era, before: def.before || 'The Old Days',
            isDate, isLeap, daysIn, daysInYear, dayNumber, dayOfYear, weekday, check, compare, format, parse, now,
            seasons, season, moons, occursOn, moonDefs,
        };
    }

    ATH.makeCalendar = makeCalendar;
    if (typeof module !== 'undefined' && module.exports) module.exports = { makeCalendar };
})(typeof window !== 'undefined' ? window : globalThis);
