'use strict';

const crypto = require('crypto');
const Homey = require('homey');
const Agenda = require('./lib/agenda');

const TICK = 30 * 1000;
const WIDGETS = ['next_event', 'free_busy', 'countdown', 'week', 'timeline', 'month', 'next_call'];
const MAX_LATE = 10 * 60 * 1000; // after a restart, do not fire triggers that are more than 10 minutes old

class WeekdotApp extends Homey.App {
  async onInit() {
    // 0.0.3 / 0.0.4 made a key of their own at start-up (without a linked device); that key blocked linking.
    if (this.homey.settings.get('pairingKey') && !this.homey.settings.get('pairedDevice')) {
      this.homey.settings.unset('pairingKey');
    }
    this.agenda = new Agenda(this.homey);
    this.lastTick = Date.now();
    this.fired = new Set();

    const flow = this.homey.flow;
    const calendarAutocomplete = async query => this.calendarChoices(query);

    this.started = flow.getTriggerCard('event_started');
    this.ended = flow.getTriggerCard('event_ended');
    this.startsIn = flow.getTriggerCard('event_starts_in');
    this.daysBefore = flow.getTriggerCard('event_days_before');
    this.atTime = flow.getTriggerCard('agenda_at_time');
    this.received = flow.getTriggerCard('schedule_received');
    // 1.0.5: video calls, first event of the day, time to leave
    this.callStartsIn = flow.getTriggerCard('call_starts_in');
    this.callStarted = flow.getTriggerCard('call_started');
    this.callEnded = flow.getTriggerCard('call_ended');
    this.firstStartsIn = flow.getTriggerCard('first_event_starts_in');
    this.leave = flow.getTriggerCard('time_to_leave');

    for (const card of [this.started, this.ended]) {
      card.registerRunListener(async (args, state) => this.agenda.matches(state.event, args));
      card.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    }
    this.startsIn.registerRunListener(async (args, state) => Number(args.minutes) === state.minutes && this.agenda.matches(state.event, args));
    this.startsIn.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    this.daysBefore.registerRunListener(async (args, state) => Number(args.days) === state.days && args.time === state.time
      && this.agenda.matches(state.event, args));
    this.daysBefore.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    this.atTime.registerRunListener(async (args, state) => args.time === state.time);
    for (const card of [this.callStarted, this.callEnded]) {
      card.registerRunListener(async (args, state) => this.agenda.matches(state.event, args));
      card.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    }
    for (const card of [this.callStartsIn, this.leave]) {
      card.registerRunListener(async (args, state) => Number(args.minutes) === state.minutes && this.agenda.matches(state.event, args));
      card.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    }
    // "first event of the day" depends on the card's own filter, so every card only answers for its own filter
    this.firstKey = args => `${Number(args.minutes)}|${(args.calendar && args.calendar.id) || '*'}|${(args.keyword || '').trim().toLowerCase()}`;
    this.firstStartsIn.registerRunListener(async (args, state) => this.firstKey(args) === state.key);
    this.firstStartsIn.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);

    const now = () => new Date();
    const conditions = {
      event_now: args => this.agenda.events.some(e => this.agenda.isNow(e, now()) && this.agenda.matches(e, args)),
      event_today: args => this.agenda.eventsOn(this.agenda.dayKey(now())).some(e => this.agenda.matches(e, args)),
      event_tomorrow: args => this.agenda.eventsOn(this.agenda.dayKey(now(), 1)).some(e => this.agenda.matches(e, args)),
      event_in_days: args => {
        const days = Number(args.days);
        const day = this.agenda.dayKey(now(), days);
        // only answer for days Weekdot has sent, so an inverted card does not say "no event" without knowing
        if (!this.agenda.covers(day)) {
          throw new Error(this.homey.__('errors.out_of_range', { days: this.agenda.daysCovered(now()) }));
        }
        return this.agenda.eventsOn(day).some(e => this.agenda.matches(e, args));
      },
      in_call: args => this.agenda.events.some(e => e.call && !e.allDay && this.agenda.isNow(e, now()) && this.agenda.matches(e, args)),
      busy_now: args => this.agenda.events.some(e => this.agenda.isBusy(e) && this.agenda.isNow(e, now()) && this.agenda.matches(e, args)),
    };
    for (const [id, fn] of Object.entries(conditions)) {
      const card = flow.getConditionCard(id);
      card.registerRunListener(async args => fn(args));
      card.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    }

    const nextCard = flow.getActionCard('get_next_event');
    nextCard.registerArgumentAutocompleteListener('calendar', calendarAutocomplete);
    nextCard.registerRunListener(async args => {
      const e = this.agenda.next(args);
      if (!e) {
        return { found: false, title: '', emoji: '', location: '', calendar: '', start_time: '', date: '', minutes_until: 0 };
      }
      const t = this.agenda.tokens(e);
      return {
        found: true, title: t.title, emoji: t.emoji, location: t.location, calendar: t.calendar, start_time: t.start_time,
        date: this.agenda.dayKey(new Date(e.start)),
        minutes_until: Math.max(0, Math.round((Date.parse(e.start) - Date.now()) / 60000)),
      };
    });
    flow.getActionCard('get_agenda').registerRunListener(async args => {
      const day = this.agenda.dayKey(new Date(), args.day === 'tomorrow' ? 1 : 0);
      return this.agenda.agendaTokens(this.agenda.eventsOn(day));
    });

    // global Flow tokens
    this.tokens = {
      nextTitle: await flow.createToken('next_title', { type: 'string', title: this.homey.__('tokens.next_title') }),
      nextTime: await flow.createToken('next_time', { type: 'string', title: this.homey.__('tokens.next_time') }),
      todayCount: await flow.createToken('today_count', { type: 'number', title: this.homey.__('tokens.today_count') }),
    };

    // widgets: choose a calendar in the widget settings
    for (const id of WIDGETS) {
      try {
        this.homey.dashboards.getWidget(id).registerSettingAutocompleteListener('calendar', async query => calendarAutocomplete(query));
      } catch (err) { this.error('widget', id, err.message); }
    }

    await this.updateTokens();
    this.homey.setInterval(() => this.tick().catch(err => this.error('tick', err)), TICK);
    this.log('Weekdot ready,', this.agenda.events.length, 'events');
  }

  // ---- API (api.js) ----

  /** Weekdot registers its secret key once; the first key wins until "Remove" in the settings clears it. */
  pair(body) {
    const key = body && typeof body.key === 'string' ? body.key : '';
    if (!/^[0-9a-f]{32,128}$/.test(key)) throw new Error('bad_key');
    const stored = this.homey.settings.get('pairingKey');
    if (stored && !this.keyMatches(key)) throw new Error('already_linked');
    if (!stored) {
      this.homey.settings.set('pairingKey', key);
      this.homey.settings.set('pairedDevice', String(body.device || 'Weekdot').slice(0, 120));
      this.log('Linked with Weekdot on', body.device);
    }
    return { ok: true };
  }

  keyMatches(given) {
    const key = this.homey.settings.get('pairingKey');
    if (!key || typeof given !== 'string' || given.length !== key.length) return false;
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
  }

  async receiveSchedule(body) {
    if (!body || !this.keyMatches(body.key)) {
      const err = new Error('Invalid pairing key');
      err.statusCode = 401;
      throw err;
    }
    let count;
    try {
      count = this.agenda.store(body);
    } catch (err) {
      throw new Error(this.homey.__('errors.bad_schedule'));
    }
    await this.updateTokens();
    this.homey.api.realtime('update', { count });
    await this.received.trigger({ count, device: this.agenda.data.device }).catch(err => this.error(err));
    return { ok: true, count };
  }

  status() {
    const d = this.agenda.data;
    const paired = !!this.homey.settings.get('pairingKey');
    return {
      app: 'Weekdot', version: this.homey.manifest.version, linked: !!d || paired, paired,
      device: d ? d.device : (this.homey.settings.get('pairedDevice') || null), receivedAt: d ? d.receivedAt : null,
      events: this.agenda.events.length, calendars: this.agenda.calendars, lastDay: this.agenda.lastDay || null,
    };
  }

  async clearSchedule() {
    this.agenda.clear();
    this.homey.settings.unset('pairingKey');
    this.homey.settings.unset('pairedDevice');
    await this.updateTokens();
    this.homey.api.realtime('update', { count: 0 });
    return { ok: true };
  }

  /** Data for the Agenda widget. */
  widgetData({ days = 'today', allday = true } = {}) {
    const now = new Date();
    const list = [0].concat(days === 'today_tomorrow' ? [1] : []).map(offset => {
      const day = this.agenda.dayKey(now, offset);
      const events = this.agenda.eventsOn(day, { allDay: allday !== false && allday !== 'false' }).map(e => ({
        title: e.title, emoji: e.emoji, location: e.location, color: e.color, allDay: e.allDay,
        start: e.allDay ? '' : this.agenda.time(new Date(e.start)),
        end: e.allDay ? '' : this.agenda.time(new Date(e.end)),
        now: this.agenda.isNow(e, now) && !e.allDay,
        past: !e.allDay && Date.parse(e.end) <= now.getTime(),
      }));
      return { offset, day, events };
    });
    return { linked: !!this.agenda.data, receivedAt: this.agenda.data ? this.agenda.data.receivedAt : null, days: list };
  }

  /** Data for the small widgets (see widgets/*). q: { calendar, keyword, weekStart } */
  widgetFeed(type, q = {}) {
    const a = this.agenda;
    if (!a.data) return { linked: false };
    const now = new Date();
    const nowMs = now.getTime();
    const today = a.dayKey(now);
    const args = { calendar: q.calendar ? { id: String(q.calendar) } : null, keyword: String(q.keyword || '') };
    const evs = a.events.filter(e => a.matches(e, args));
    const addDays = (day, n) => {
      const [y, m, d] = day.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    };
    const dayDiff = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
    const weekday = day => new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    const startDay = e => (e.allDay ? e.startDay : a.dayKey(new Date(e.start)));
    const view = e => (e ? {
      title: e.title, emoji: e.emoji, location: e.location, color: e.color, allDay: e.allDay, day: startDay(e),
      start: e.allDay ? '' : a.time(new Date(e.start)), end: e.allDay ? '' : a.time(new Date(e.end)),
      startMs: Date.parse(e.start), endMs: Date.parse(e.end), now: a.isNow(e, now),
    } : null);
    const colorsOn = day => {
      const list = evs.filter(e => a.onDay(e, day));
      return { count: list.length, colors: [...new Set(list.map(e => e.color))].slice(0, 4) };
    };
    const base = { linked: true, now: nowMs, today, lastDay: a.lastDay };

    switch (type) {
      case 'next_event': {
        const cur = evs.find(e => !e.allDay && a.isNow(e, now));
        const next = evs.find(e => (e.allDay ? e.startDay > today : Date.parse(e.start) > nowMs));
        return { ...base, event: view(cur || next) };
      }
      case 'free_busy': {
        const timed = evs.filter(e => !e.allDay && !e.free && Date.parse(e.end) > nowMs && a.onDay(e, today));
        const running = timed.filter(e => Date.parse(e.start) <= nowMs);
        if (running.length) {
          let until = Math.max(...running.map(e => Date.parse(e.end)));
          for (let changed = true; changed;) { // back-to-back events count as one busy block
            changed = false;
            for (const e of timed) {
              const s = Date.parse(e.start), en = Date.parse(e.end);
              if (s <= until && en > until) { until = en; changed = true; }
            }
          }
          const after = timed.find(e => Date.parse(e.start) > until);
          const endsToday = a.dayKey(new Date(until - 1)) === today;
          return { ...base, busy: true, title: running[0].title, emoji: running[0].emoji, color: running[0].color,
            until: endsToday ? a.time(new Date(until)) : '', freeUntil: after ? a.time(new Date(after.start)) : '' };
        }
        const next = timed.find(e => Date.parse(e.start) > nowMs);
        return { ...base, busy: false, freeUntil: next ? a.time(new Date(next.start)) : '',
          nextTitle: next ? `${next.emoji ? `${next.emoji} ` : ''}${next.title}` : '' };
      }
      case 'countdown': {
        if (!args.keyword.trim()) return { ...base, setup: true };
        const e = evs.find(x => (x.allDay ? x.startDay >= today : Date.parse(x.start) > nowMs));
        return { ...base, event: view(e), days: e ? dayDiff(today, startDay(e)) : null, keyword: args.keyword };
      }
      case 'week': {
        const first = q.weekStart === 'sunday' ? 0 : 1;
        const start = addDays(today, -((weekday(today) - first + 7) % 7));
        const days = Array.from({ length: 7 }, (_, i) => {
          const day = addDays(start, i);
          return { day, today: day === today, known: !!a.lastDay && day <= a.lastDay, ...colorsOn(day) };
        });
        return { ...base, days, total: days.reduce((n, d) => n + d.count, 0) };
      }
      case 'timeline': {
        const list = evs.filter(e => a.onDay(e, today));
        const mins = ms => {
          if (a.dayKey(new Date(ms)) < today) return 0;
          if (a.dayKey(new Date(ms)) > today) return 1440;
          return a.minuteOfDay(new Date(ms));
        };
        const timed = list.filter(e => !e.allDay).map(e => ({
          title: e.title, emoji: e.emoji, color: e.color, from: mins(Date.parse(e.start)), to: Math.max(mins(Date.parse(e.end)), mins(Date.parse(e.start)) + 15),
          start: a.time(new Date(e.start)), end: a.time(new Date(e.end)),
        }));
        const allDay = list.filter(e => e.allDay).map(e => ({ title: e.title, emoji: e.emoji, color: e.color }));
        return { ...base, minute: a.minuteOfDay(now), timed, allDay };
      }
      case 'month': {
        const first = q.weekStart === 'sunday' ? 0 : 1;
        const monthStart = `${today.slice(0, 8)}01`;
        const gridStart = addDays(monthStart, -((weekday(monthStart) - first + 7) % 7));
        const [y, m] = today.split('-').map(Number);
        const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const cells = Math.ceil(((weekday(monthStart) - first + 7) % 7 + daysInMonth) / 7) * 7;
        const days = Array.from({ length: cells }, (_, i) => {
          const day = addDays(gridStart, i);
          const c = colorsOn(day);
          return { day, inMonth: day.slice(0, 7) === today.slice(0, 7), today: day === today, colors: c.colors.slice(0, 3) };
        });
        return { ...base, month: today.slice(0, 7), days };
      }
      case 'next_call': {
        const calls = evs.filter(e => e.call && !e.allDay && Date.parse(e.end) > nowMs);
        const e = calls.find(x => a.isNow(x, now)) || calls[0] || null;
        return { ...base, event: view(e), service: a.callName(e), hasLink: !!(e && e.callUrl) };
      }
      default:
        return base;
    }
  }

  // ---- internals ----

  calendarChoices(query) {
    const q = (query || '').toLowerCase();
    const list = [{ id: '*', name: this.homey.__('calendar.any') }]
      .concat(this.agenda.calendars.map(c => ({ id: c.id, name: c.title })));
    return list.filter(c => !q || c.name.toLowerCase().includes(q));
  }

  async updateTokens() {
    const e = this.agenda.next();
    await this.tokens.nextTitle.setValue(e ? `${e.emoji ? `${e.emoji} ` : ''}${e.title}` : '');
    await this.tokens.nextTime.setValue(e ? this.agenda.time(new Date(e.start)) : '');
    await this.tokens.todayCount.setValue(this.agenda.eventsOn(this.agenda.dayKey(new Date())).length);
  }

  /** Every 30 s: fire the triggers whose moment passed since the last tick. */
  async tick() {
    const nowMs = Date.now();
    const from = Math.max(this.lastTick, nowMs - MAX_LATE);
    this.lastTick = nowMs;
    const crossed = ms => ms > from && ms <= nowMs;
    const once = key => (this.fired.has(key) ? false : (this.fired.add(key), true));

    for (const e of this.agenda.events) {
      const start = Date.parse(e.start);
      const end = Date.parse(e.end);
      if (crossed(start) && once(`s|${e.id}|${start}`)) {
        await this.started.trigger(this.agenda.tokens(e), { event: e }).catch(err => this.error(err));
        if (e.call && !e.allDay) await this.callStarted.trigger(this.agenda.tokens(e), { event: e }).catch(err => this.error(err));
      }
      if (crossed(end) && once(`e|${e.id}|${end}`)) {
        await this.ended.trigger(this.agenda.tokens(e), { event: e }).catch(err => this.error(err));
        if (e.call && !e.allDay) await this.callEnded.trigger(this.agenda.tokens(e), { event: e }).catch(err => this.error(err));
      }
    }

    // video call starts in … minutes / time to leave (travel time + … minutes) / first event of the day in … minutes
    const minutesOf = async (card, min) => new Set((await card.getArgumentValues()).map(x => Number(x.minutes)).filter(m => m >= min));
    for (const m of await minutesOf(this.callStartsIn, 1)) {
      for (const e of this.agenda.events) {
        if (!e.call || e.allDay) continue;
        const at = Date.parse(e.start) - m * 60000;
        if (crossed(at) && once(`c|${m}|${e.id}|${at}`)) {
          await this.callStartsIn.trigger(this.agenda.tokens(e), { event: e, minutes: m }).catch(err => this.error(err));
        }
      }
    }
    for (const m of await minutesOf(this.leave, 0)) {
      for (const e of this.agenda.events) {
        if (e.allDay || !e.travelMinutes) continue;
        const at = Date.parse(e.start) - (e.travelMinutes + m) * 60000;
        if (crossed(at) && once(`l|${m}|${e.id}|${at}`)) {
          await this.leave.trigger(this.agenda.tokens(e), { event: e, minutes: m }).catch(err => this.error(err));
        }
      }
    }
    const firstArgs = await this.firstStartsIn.getArgumentValues();
    if (firstArgs.length) {
      for (const offset of [0, 1]) {            // the first event of tomorrow can be less than … minutes after midnight
        const day = this.agenda.dayKey(new Date(nowMs), offset);
        for (const arg of firstArgs) {
          const m = Number(arg.minutes);
          const e = this.agenda.firstOfDay(day, arg);
          if (!e || !(m >= 1)) continue;
          const at = Date.parse(e.start) - m * 60000;
          const key = this.firstKey(arg);
          if (crossed(at) && once(`f|${key}|${e.id}|${at}`)) {
            await this.firstStartsIn.trigger(this.agenda.tokens(e), { event: e, minutes: m, key }).catch(err => this.error(err));
          }
        }
      }
    }

    // "starts in … minutes": only for the minute values used in Flows
    const minuteValues = new Set((await this.startsIn.getArgumentValues()).map(a => Number(a.minutes)).filter(m => m > 0));
    for (const m of minuteValues) {
      for (const e of this.agenda.events) {
        if (e.allDay) continue;
        const at = Date.parse(e.start) - m * 60000;
        if (crossed(at) && once(`i|${m}|${e.id}|${at}`)) {
          await this.startsIn.trigger(this.agenda.tokens(e), { event: e, minutes: m }).catch(err => this.error(err));
        }
      }
    }

    // "starts in … days": at the chosen time, for events that start that many days from today
    const fromDate = new Date(from);
    const nowDate = new Date(nowMs);
    const sameDay = this.agenda.dayKey(fromDate) === this.agenda.dayKey(nowDate);
    const a = sameDay ? this.agenda.minuteOfDay(fromDate) : -1;
    const b = this.agenda.minuteOfDay(nowDate);
    const timePassed = time => {
      const [h, mi] = String(time).split(':').map(Number);
      const t = h * 60 + mi;
      return t > a && t <= b;
    };
    const today = this.agenda.dayKey(nowDate);
    const dayPairs = new Map();
    for (const arg of await this.daysBefore.getArgumentValues()) {
      const days = Number(arg.days);
      if (days >= 1 && days <= 92 && arg.time) dayPairs.set(`${days}|${arg.time}`, { days, time: arg.time });
    }
    for (const { days, time } of dayPairs.values()) {
      if (!timePassed(time)) continue;
      const target = this.agenda.dayKey(nowDate, days);
      for (const e of this.agenda.events) {
        const startDay = e.allDay ? e.startDay : this.agenda.dayKey(new Date(e.start));
        if (startDay !== target || !once(`d|${days}|${time}|${e.id}|${startDay}|${today}`)) continue;
        await this.daysBefore.trigger({ ...this.agenda.tokens(e), date: startDay, days }, { event: e, days, time })
          .catch(err => this.error(err));
      }
    }

    // daily agenda at a set time
    const times = new Set((await this.atTime.getArgumentValues()).map(a => a.time).filter(Boolean));
    if (times.size) {
      for (const time of times) {
        const [h, mi] = time.split(':').map(Number);
        const t = h * 60 + mi;
        if (t > a && t <= b && once(`t|${time}|${this.agenda.dayKey(nowDate)}`)) {
          const list = this.agenda.eventsOn(this.agenda.dayKey(nowDate));
          await this.atTime.trigger(this.agenda.agendaTokens(list), { time }).catch(err => this.error(err));
        }
      }
    }

    if (this.fired.size > 5000) this.fired = new Set([...this.fired].slice(-1000));
    if (new Date(nowMs).getSeconds() < TICK / 1000) await this.updateTokens();
  }
}

module.exports = WeekdotApp;
