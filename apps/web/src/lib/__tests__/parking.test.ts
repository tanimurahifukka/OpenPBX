import { describe, expect, it, beforeEach } from 'vitest';
import { parseParkedCallEvent, applyParkingEvent, type ParkedCall } from '../ami';

describe('parseParkedCallEvent', () => {
  it('maps a ParkedCall AMI event into a ParkedCall', () => {
    const pc = parseParkedCallEvent({
      Event: 'ParkedCall',
      ParkingSpace: '701',
      ParkeeChannel: 'PJSIP/1001-00000005',
      ParkeeCallerIDNum: '0312345678',
      ParkeeCallerIDName: 'Acme',
      ParkingTimeout: '90',
      ParkingDuration: '12',
    });
    expect(pc).toEqual<ParkedCall>({
      parkingSpace: '701',
      channel: 'PJSIP/1001-00000005',
      callerIdNum: '0312345678',
      callerIdName: 'Acme',
      timeoutSeconds: 90,
      durationSeconds: 12,
    });
  });

  it('returns null without a parking space', () => {
    expect(parseParkedCallEvent({ Event: 'ParkedCall' })).toBeNull();
  });
});

describe('applyParkingEvent', () => {
  let parked: Map<string, ParkedCall>;
  beforeEach(() => {
    parked = new Map();
  });

  it('adds a parked call on ParkedCall and reports handled', () => {
    const handled = applyParkingEvent(parked, {
      Event: 'ParkedCall',
      ParkingSpace: '701',
      ParkeeCallerIDNum: '0312345678',
    });
    expect(handled).toBe(true);
    expect(parked.get('701')?.callerIdNum).toBe('0312345678');
  });

  it('removes a parked call when it is retrieved (UnParkedCall)', () => {
    applyParkingEvent(parked, { Event: 'ParkedCall', ParkingSpace: '701' });
    const handled = applyParkingEvent(parked, { Event: 'UnParkedCall', ParkingSpace: '701' });
    expect(handled).toBe(true);
    expect(parked.has('701')).toBe(false);
  });

  it('removes a parked call on timeout and on give-up', () => {
    applyParkingEvent(parked, { Event: 'ParkedCall', ParkingSpace: '702' });
    applyParkingEvent(parked, { Event: 'ParkedCallTimeOut', ParkingSpace: '702' });
    expect(parked.has('702')).toBe(false);

    applyParkingEvent(parked, { Event: 'ParkedCall', ParkingSpace: '703' });
    applyParkingEvent(parked, { Event: 'ParkedCallGiveUp', ParkingSpace: '703' });
    expect(parked.has('703')).toBe(false);
  });

  it('ignores unrelated events and the ParkedCallsComplete terminator', () => {
    expect(applyParkingEvent(parked, { Event: 'Newchannel', Uniqueid: 'x' })).toBe(false);
    expect(applyParkingEvent(parked, { Event: 'ParkedCallsComplete' })).toBe(false);
  });
});
