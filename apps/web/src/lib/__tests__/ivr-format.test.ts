import { describe, expect, it } from 'vitest';
import {
  parseIvrOptionLines,
  serializeIvrOptions,
  parseCallerIdRouteLines,
  serializeCallerIdRoutes,
  type IvrOption,
  type CallerIdRoute,
} from '../ivr-format';

describe('IVR option send_sms round-trip', () => {
  it('round-trips a send_sms option through serialize → parse', () => {
    const input: IvrOption[] = [
      { digit: '1', action: 'send_sms', target: 'reservation-form', label: '予約URL送信' },
    ];
    expect(parseIvrOptionLines(serializeIvrOptions(input))).toEqual(input);
  });
});

describe('IVR option extended fields (play_guidance / record_message)', () => {
  it('keeps the legacy 4-field wire format for options without extra fields', () => {
    expect(serializeIvrOptions([{ digit: '1', action: 'hangup', target: null, label: null }])).toBe('1|hangup||');
  });

  it('round-trips a play_guidance option with nextAction', () => {
    const input: IvrOption[] = [
      { digit: '1', action: 'play_guidance', target: 'custom/info', label: null, nextAction: 'hangup' },
    ];
    expect(parseIvrOptionLines(serializeIvrOptions(input))).toEqual(input);
  });

  it('round-trips a record_message option with maxSeconds and intro', () => {
    const input: IvrOption[] = [
      {
        digit: '2',
        action: 'record_message',
        target: null,
        label: '伝言',
        recordMaxSeconds: 45,
        recordIntroPath: 'custom/intro',
      },
    ];
    expect(parseIvrOptionLines(serializeIvrOptions(input))).toEqual(input);
  });
});

describe('parseCallerIdRouteLines', () => {
  it('parses supported actions (goto_extension / goto_ivr / hangup)', () => {
    const raw = '0312345678|goto_extension|1001|VIP\n090*|hangup||\n12345|goto_ivr|9100|';
    expect(parseCallerIdRouteLines(raw)).toEqual([
      { pattern: '0312345678', action: 'goto_extension', target: '1001', label: 'VIP' },
      { pattern: '090*', action: 'hangup', target: null, label: null },
      { pattern: '12345', action: 'goto_ivr', target: '9100', label: null },
    ]);
  });

  it('rejects unsupported actions (goto_ringgroup / send_sms are not valid for caller-id routes)', () => {
    expect(parseCallerIdRouteLines('0312345678|goto_ringgroup|6000|')).toEqual([]);
    expect(parseCallerIdRouteLines('090*|send_sms|tmpl|')).toEqual([]);
  });

  it('skips lines missing a pattern or action', () => {
    expect(parseCallerIdRouteLines('|goto_extension|1001|\n090*||')).toEqual([]);
  });

  it('ignores blank lines and trims whitespace', () => {
    expect(parseCallerIdRouteLines('\n  090* | hangup |  |  \n')).toEqual([
      { pattern: '090*', action: 'hangup', target: null, label: null },
    ]);
  });
});

describe('serializeCallerIdRoutes', () => {
  it('pipe-joins fields with empty target/label', () => {
    const routes: CallerIdRoute[] = [
      { id: 1, position: 0, pattern: '090*', action: 'hangup', target: null, label: null },
    ];
    expect(serializeCallerIdRoutes(routes)).toBe('090*|hangup||');
  });

  it('serialize → parse preserves the prefix pattern and action', () => {
    const routes: CallerIdRoute[] = [
      { id: 7, position: 2, pattern: '0799*', action: 'goto_extension', target: '1001', label: '地元' },
    ];
    const parsed = parseCallerIdRouteLines(serializeCallerIdRoutes(routes));
    expect(parsed).toEqual([
      { pattern: '0799*', action: 'goto_extension', target: '1001', label: '地元' },
    ]);
  });
});
