import { describe, expect, it, beforeEach } from 'vitest';
import {
  parseAmiBlock,
  applyChannelEvent,
  summarizeChannels,
  type ChannelInfo,
} from '../ami';

function block(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');
}

describe('parseAmiBlock', () => {
  it('parses Key: Value pairs and trims values', () => {
    const f = parseAmiBlock('Event: Newchannel\r\nUniqueid:   123.4  \r\nChannel: PJSIP/1001-1');
    expect(f.Event).toBe('Newchannel');
    expect(f.Uniqueid).toBe('123.4');
    expect(f.Channel).toBe('PJSIP/1001-1');
  });

  it('ignores lines without a colon', () => {
    const f = parseAmiBlock('Event: Hangup\r\ngarbage line\r\nUniqueid: 9');
    expect(f).toEqual({ Event: 'Hangup', Uniqueid: '9' });
  });
});

describe('applyChannelEvent + summarizeChannels', () => {
  let channels: Map<string, ChannelInfo>;
  let recordings: Set<string>;
  const apply = (fields: Record<string, string>) => applyChannelEvent(channels, recordings, parseAmiBlock(block(fields)));

  beforeEach(() => {
    channels = new Map();
    recordings = new Set();
  });

  it('Newchannel adds a live channel and flags anyActiveCall', () => {
    apply({ Event: 'Newchannel', Uniqueid: 'u1', Channel: 'PJSIP/1001-1', ChannelStateDesc: 'Ring' });
    const s = summarizeChannels(channels.values(), recordings);
    expect(s.activeChannels).toBe(1);
    expect(s.anyActiveCall).toBe(true);
  });

  it('Newchannel then Hangup removes the channel', () => {
    apply({ Event: 'Newchannel', Uniqueid: 'u1', Channel: 'PJSIP/1001-1', ChannelStateDesc: 'Ring' });
    apply({ Event: 'Hangup', Uniqueid: 'u1', Channel: 'PJSIP/1001-1' });
    const s = summarizeChannels(channels.values(), recordings);
    expect(s.activeChannels).toBe(0);
    expect(s.anyActiveCall).toBe(false);
  });

  it('Newstate updates the channel state without duplicating it', () => {
    apply({ Event: 'Newchannel', Uniqueid: 'u1', Channel: 'PJSIP/1001-1', ChannelStateDesc: 'Ring' });
    apply({ Event: 'Newstate', Uniqueid: 'u1', Channel: 'PJSIP/1001-1', ChannelStateDesc: 'Up' });
    expect(channels.size).toBe(1);
    expect(channels.get('u1')?.state).toBe('Up');
  });

  it('Newstate for an unknown channel adds it', () => {
    apply({ Event: 'Newstate', Uniqueid: 'u9', Channel: 'PJSIP/1002-2', ChannelStateDesc: 'Up' });
    expect(channels.get('u9')?.state).toBe('Up');
  });

  it('MixMonitorStart then MixMonitorStop clears the recording', () => {
    apply({ Event: 'MixMonitorStart', Uniqueid: 'u1', Channel: 'PJSIP/1001-1' });
    expect(summarizeChannels(channels.values(), recordings).recordingActive).toBe(true);
    apply({ Event: 'MixMonitorStop', Uniqueid: 'u1', Channel: 'PJSIP/1001-1' });
    expect(summarizeChannels(channels.values(), recordings).recordingActive).toBe(false);
  });

  it('MixMonitorStop without a prior Start is a harmless no-op', () => {
    apply({ Event: 'MixMonitorStop', Uniqueid: 'u-never', Channel: 'PJSIP/1001-1' });
    expect(recordings.size).toBe(0);
  });

  it('Hangup of a recording channel also clears its recording entry', () => {
    apply({ Event: 'Newchannel', Uniqueid: 'u1', Channel: 'PJSIP/1001-1', ChannelStateDesc: 'Up' });
    apply({ Event: 'MixMonitorStart', Uniqueid: 'u1', Channel: 'PJSIP/1001-1' });
    apply({ Event: 'Hangup', Uniqueid: 'u1', Channel: 'PJSIP/1001-1' });
    const s = summarizeChannels(channels.values(), recordings);
    expect(s.recordingActive).toBe(false);
    expect(s.recordingCount).toBe(0);
    expect(s.activeChannels).toBe(0);
  });

  it('ignores events that carry no Uniqueid', () => {
    apply({ Event: 'Newchannel', Channel: 'PJSIP/1001-1', ChannelStateDesc: 'Ring' });
    expect(channels.size).toBe(0);
  });

  it('CoreShowChannel seeds a channel (restart mid-call recovery)', () => {
    apply({ Event: 'CoreShowChannel', Uniqueid: 'u5', Channel: 'PJSIP/1003-3', ChannelStateDesc: 'Up' });
    expect(channels.get('u5')?.channel).toBe('PJSIP/1003-3');
  });
});

describe('summarizeChannels', () => {
  it('reports recordingActive=false (not null) when there are zero recordings', () => {
    const s = summarizeChannels([], new Set());
    expect(s.recordingActive).toBe(false);
    expect(s.recordingCount).toBe(0);
    expect(s.anyActiveCall).toBe(false);
  });

  it('counts multiple channels and recordings', () => {
    const channels: ChannelInfo[] = [
      { uniqueid: 'a', channel: 'PJSIP/1001-1', state: 'Up' },
      { uniqueid: 'b', channel: 'PJSIP/9001-2', state: 'Up' },
    ];
    const s = summarizeChannels(channels, new Set(['a']));
    expect(s.activeChannels).toBe(2);
    expect(s.recordingCount).toBe(1);
    expect(s.recordingActive).toBe(true);
  });
});
