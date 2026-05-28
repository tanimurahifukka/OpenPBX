import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  createBox,
  createMessage,
  countByStatus,
  deleteBox,
  deleteMessage,
  getMessageByUniqueId,
  getBox,
  listBoxes,
  listMessages,
  recordMessageFromEvent,
  renderVoicemailDialplan,
  updateBox,
  updateMessageStatus,
  type VoicemailBox,
} from '../voicemail';

let db: Database.Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe('voicemail box CRUD', () => {
  it('creates and retrieves a box', () => {
    const box = createBox({ number: '9100', name: '代表留守電' }, db);
    expect(box.number).toBe('9100');
    expect(box.name).toBe('代表留守電');
    expect(getBox('9100', db)).toEqual(box);
  });

  it('lists all boxes ordered by number', () => {
    createBox({ number: '9102', name: 'B' }, db);
    createBox({ number: '9100', name: 'A' }, db);
    createBox({ number: '9101', name: 'C' }, db);
    const boxes = listBoxes(db);
    expect(boxes.map((b) => b.number)).toEqual(['9100', '9101', '9102']);
  });

  it('updates a box', () => {
    createBox({ number: '9100', name: '旧名' }, db);
    const updated = updateBox({ number: '9100', name: '新名', prompt: 'custom/vm-intro' }, db);
    expect(updated.name).toBe('新名');
    expect(updated.prompt).toBe('custom/vm-intro');
  });

  it('deletes a box and cascades messages', () => {
    createBox({ number: '9100' }, db);
    createMessage({ boxNumber: '9100', callerId: '09012345678', uniqueId: 'u1' }, db);
    expect(deleteBox('9100', db)).toBe(true);
    expect(listMessages({}, db)).toHaveLength(0);
  });

  it('rejects invalid number', () => {
    expect(() => createBox({ number: 'abc' }, db)).toThrow('2〜6 桁');
  });

  it('rejects duplicate number', () => {
    createBox({ number: '9100' }, db);
    expect(() => createBox({ number: '9100' }, db)).toThrow('既存');
  });
});

describe('voicemail message CRUD', () => {
  let box: VoicemailBox;

  beforeEach(() => {
    box = createBox({ number: '9100', name: 'テスト' }, db);
  });

  it('creates a message', () => {
    const msg = createMessage({
      boxNumber: '9100',
      callerId: '09012345678',
      callerName: '谷村',
      uniqueId: 'u1',
      recordingFile: 'u1-vm-9100-09012345678.wav',
      durationSec: 15,
    }, db);
    expect(msg.status).toBe('new');
    expect(msg.boxId).toBe(box.id);
    expect(msg.callerId).toBe('09012345678');
  });

  it('lists messages with box info', () => {
    createMessage({ boxNumber: '9100', callerId: '090', uniqueId: 'u1' }, db);
    const msgs = listMessages({}, db);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].boxNumber).toBe('9100');
    expect(msgs[0].boxName).toBe('テスト');
  });

  it('filters by status', () => {
    createMessage({ boxNumber: '9100', callerId: '090', uniqueId: 'u1' }, db);
    createMessage({ boxNumber: '9100', callerId: '080', uniqueId: 'u2' }, db);
    updateMessageStatus(1, 'read', db);
    expect(listMessages({ status: 'new' }, db)).toHaveLength(1);
    expect(listMessages({ status: 'read' }, db)).toHaveLength(1);
  });

  it('updates status to read', () => {
    const msg = createMessage({ boxNumber: '9100', callerId: '090', uniqueId: 'u1' }, db);
    updateMessageStatus(msg.id, 'read', db);
    const msgs = listMessages({}, db);
    expect(msgs[0].status).toBe('read');
    expect(msgs[0].readAt).toBeTruthy();
  });

  it('updates status to callback_done', () => {
    const msg = createMessage({ boxNumber: '9100', callerId: '090', uniqueId: 'u1' }, db);
    updateMessageStatus(msg.id, 'callback_done', db);
    const msgs = listMessages({}, db);
    expect(msgs[0].status).toBe('callback_done');
    expect(msgs[0].callbackAt).toBeTruthy();
  });

  it('counts by status', () => {
    createMessage({ boxNumber: '9100', callerId: '090', uniqueId: 'u1' }, db);
    createMessage({ boxNumber: '9100', callerId: '080', uniqueId: 'u2' }, db);
    createMessage({ boxNumber: '9100', callerId: '070', uniqueId: 'u3' }, db);
    updateMessageStatus(1, 'read', db);
    updateMessageStatus(2, 'callback_done', db);
    const counts = countByStatus(db);
    expect(counts.new).toBe(1);
    expect(counts.read).toBe(1);
    expect(counts.callback_done).toBe(1);
  });

  it('deletes a message', () => {
    const msg = createMessage({ boxNumber: '9100', callerId: '090', uniqueId: 'u1' }, db);
    expect(deleteMessage(msg.id, db)).toBe(true);
    expect(listMessages({}, db)).toHaveLength(0);
  });

  it('records a message from an event idempotently', () => {
    const first = recordMessageFromEvent({
      boxNumber: '9100',
      callerId: '09012345678',
      callerName: '谷村',
      uniqueId: 'u-event',
      recordingFile: 'u-event.wav',
    }, db);
    const second = recordMessageFromEvent({
      boxNumber: '9100',
      callerId: '09012345678',
      callerName: '谷村',
      uniqueId: 'u-event',
      recordingFile: 'u-event.wav',
    }, db);
    expect(first?.id).toBe(second?.id);
    expect(getMessageByUniqueId('u-event', db)?.recordingFile).toBe('u-event.wav');
    expect(listMessages({}, db)).toHaveLength(1);
  });

  it('returns null when event references a missing box', () => {
    expect(recordMessageFromEvent({ boxNumber: '9999', callerId: '090', uniqueId: 'u1' }, db)).toBeNull();
  });

  it('rejects message for non-existent box', () => {
    expect(() => createMessage({ boxNumber: '9999', callerId: '090', uniqueId: 'u1' }, db)).toThrow('存在しません');
  });
});

describe('renderVoicemailDialplan', () => {
  it('returns minimal output for empty boxes', () => {
    const out = renderVoicemailDialplan([]);
    expect(out).toContain('AUTO-GENERATED');
    expect(out).not.toContain('[internal]');
  });

  it('generates voicemail context with Record', () => {
    const boxes: VoicemailBox[] = [
      { id: 1, number: '9100', name: '代表', prompt: 'custom/vm-reception', updatedAt: '' },
    ];
    const out = renderVoicemailDialplan(boxes);
    expect(out).toContain('[voicemail-9100]');
    expect(out).toContain('Playback(custom/vm-reception)');
    expect(out).toContain('Set(EVENT_KIND=voicemail)');
    expect(out).toContain('Set(EVENT_EXT=9100)');
    expect(out).toContain('Record(${RECORD_FILE},3,120,k)');
    expect(out).toContain('notify-event.sh');
  });

  it('generates internal extension entry', () => {
    const boxes: VoicemailBox[] = [
      { id: 1, number: '9100', name: null, prompt: null, updatedAt: '' },
    ];
    const out = renderVoicemailDialplan(boxes);
    expect(out).toContain('[internal]');
    expect(out).toContain('exten => 9100,1,NoOp(Voicemail box 9100 entry)');
    expect(out).toContain('Goto(voicemail-9100,s,1)');
  });

  it('skips prompt playback when no prompt set', () => {
    const boxes: VoicemailBox[] = [
      { id: 1, number: '9100', name: null, prompt: null, updatedAt: '' },
    ];
    const out = renderVoicemailDialplan(boxes);
    expect(out).not.toContain('Playback(custom/');
    expect(out).toContain('Playback(beep)');
  });

  it('generates multiple box contexts', () => {
    const boxes: VoicemailBox[] = [
      { id: 1, number: '9100', name: '代表', prompt: null, updatedAt: '' },
      { id: 2, number: '9101', name: '受付', prompt: null, updatedAt: '' },
    ];
    const out = renderVoicemailDialplan(boxes);
    expect(out).toContain('[voicemail-9100]');
    expect(out).toContain('[voicemail-9101]');
  });
});
