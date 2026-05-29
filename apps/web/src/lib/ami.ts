// Asterisk Manager Interface (AMI) クライアント。
// 依存追加なしで Node の net.Socket を使い、Action/Event を改行ベースでパースする。
//
// 役割:
//   - 接続維持 (指数バックオフ再接続)
//   - イベント購読: DeviceStateChange / ContactStatus / PeerStatus / ContactStatusDetail
//   - メモリ上に最新の端末状態を保持
//   - SSE 経由で UI に配信するための pub-sub
//
// Next.js App Router の "nodejs" runtime で常駐させる前提。

import net from 'node:net';
import { EventEmitter } from 'node:events';

const HOST = process.env.AMI_HOST ?? 'asterisk';
const PORT = Number(process.env.AMI_PORT ?? '5038');
const USERNAME = process.env.AMI_USERNAME ?? 'openpbx';
const SECRET = process.env.AMI_SECRET ?? 'openpbx-ami-secret';

export type DeviceState =
  | 'unknown'
  | 'not_inuse'
  | 'inuse'
  | 'busy'
  | 'invalid'
  | 'unavailable'
  | 'ringing'
  | 'ringinuse'
  | 'onhold';

export interface DeviceInfo {
  device: string; // e.g. "PJSIP/1001"
  extension: string | null; // "1001"
  state: DeviceState;
  contact: string | null; // last seen contact URI (from ContactStatus)
  reachable: boolean | null;
  updatedAt: string; // ISO
}

const STATE_MAP: Record<string, DeviceState> = {
  UNKNOWN: 'unknown',
  NOT_INUSE: 'not_inuse',
  INUSE: 'inuse',
  BUSY: 'busy',
  INVALID: 'invalid',
  UNAVAILABLE: 'unavailable',
  RINGING: 'ringing',
  RINGINUSE: 'ringinuse',
  ONHOLD: 'onhold',
  // text variants
  'Not in use': 'not_inuse',
  'In use': 'inuse',
  Busy: 'busy',
  Ringing: 'ringing',
  Unavailable: 'unavailable',
};

function normalizeState(s: string | undefined): DeviceState {
  if (!s) return 'unknown';
  return STATE_MAP[s] ?? STATE_MAP[s.toUpperCase()] ?? 'unknown';
}

function extractExt(device: string): string | null {
  // "PJSIP/1001" → "1001"
  const m = device.match(/^PJSIP\/([0-9a-zA-Z_]+)/);
  return m ? m[1] : null;
}

class AmiClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private actionId = 0;
  private retries = 0;
  private connected = false;
  private loggedIn = false;
  private devices = new Map<string, DeviceInfo>();
  // Live call channels keyed by Uniqueid (Newchannel..Hangup) and the set of
  // Uniqueids with an open MixMonitor recording. Used by the Safety Kernel.
  private channels = new Map<string, ChannelInfo>();
  private recordings = new Set<string>();
  // Currently parked calls keyed by parking space (e.g. "701").
  private parked = new Map<string, ParkedCall>();
  private destroyed = false;

  start(): void {
    if (this.connected || this.destroyed) return;
    this.connect();
  }

  getDevices(): DeviceInfo[] {
    return Array.from(this.devices.values()).sort((a, b) =>
      (a.extension ?? '').localeCompare(b.extension ?? ''),
    );
  }

  isConnected(): boolean {
    return this.connected && this.loggedIn;
  }

  channelSummary(): ChannelActivitySummary {
    return summarizeChannels(this.channels.values(), this.recordings);
  }

  getParkedCalls(): ParkedCall[] {
    return Array.from(this.parked.values()).sort((a, b) =>
      a.parkingSpace.localeCompare(b.parkingSpace),
    );
  }

  private connect(): void {
    if (this.destroyed) return;
    const socket = net.createConnection({ host: HOST, port: PORT }, () => {
      this.connected = true;
      this.retries = 0;
      console.log(`[ami] connected to ${HOST}:${PORT}`);
    });
    this.socket = socket;
    this.buffer = '';

    socket.setEncoding('utf-8');
    socket.on('data', (chunk: string) => this.onData(chunk));
    socket.on('error', (err) => {
      console.warn('[ami] socket error:', err.message);
    });
    socket.on('close', () => {
      this.connected = false;
      this.loggedIn = false;
      this.socket = null;
      // Channel/recording/parking state is only valid while connected. Drop it
      // on disconnect so we never report a stale "call active" / parked call.
      this.channels.clear();
      this.recordings.clear();
      this.parked.clear();
      if (this.destroyed) return;
      const delay = Math.min(30_000, 1000 * Math.pow(2, this.retries++));
      console.log(`[ami] reconnecting in ${delay}ms`);
      setTimeout(() => this.connect(), delay);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    // 最初の greeting "Asterisk Call Manager/x.y.z\r\n" は単独行で来る。
    if (!this.loggedIn && this.buffer.startsWith('Asterisk Call Manager')) {
      const idx = this.buffer.indexOf('\r\n');
      if (idx >= 0) {
        this.buffer = this.buffer.slice(idx + 2);
        this.sendLogin();
      }
    }
    // event / response は空行 "\r\n\r\n" で区切られる
    let sep = this.buffer.indexOf('\r\n\r\n');
    while (sep >= 0) {
      const block = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 4);
      this.handleBlock(block);
      sep = this.buffer.indexOf('\r\n\r\n');
    }
  }

  private sendLogin(): void {
    this.send({
      Action: 'Login',
      Username: USERNAME,
      Secret: SECRET,
      Events: 'on',
    });
  }

  private send(fields: Record<string, string>): void {
    if (!this.socket) return;
    const id = String(++this.actionId);
    const lines = [...Object.entries({ ...fields, ActionID: id }).map(([k, v]) => `${k}: ${v}`), '', ''];
    this.socket.write(lines.join('\r\n'));
  }

  private handleBlock(block: string): void {
    const fields = parseAmiBlock(block);
    if (fields.Response === 'Success' && fields.Message?.includes('Authentication accepted')) {
      this.loggedIn = true;
      console.log('[ami] authenticated');
      // 初期 sync: 既存 endpoint と device state を取得
      this.send({ Action: 'DeviceStateList' });
      this.send({ Action: 'PJSIPShowEndpoints' });
      // Seed live channels after a Web restart mid-call (CoreShowChannel
      // events follow). Active MixMonitor recordings cannot be re-listed, so
      // recordingActive may briefly under-count until the next start/stop.
      this.send({ Action: 'CoreShowChannels' });
      // Seed currently parked calls (ParkedCall events + ParkedCallsComplete).
      this.send({ Action: 'ParkedCalls' });
      return;
    }
    const event = fields.Event;
    if (!event) return;

    // Track live channels + recordings for the Safety Kernel. No-op for any
    // event that is not a channel/recording lifecycle event.
    applyChannelEvent(this.channels, this.recordings, fields);
    // Track parked calls; emit so the parking SSE updates promptly.
    if (applyParkingEvent(this.parked, fields)) this.emit('change', null);

    if (event === 'DeviceStateChange' || event === 'DeviceStateChanged' || event === 'DeviceStateList') {
      const device = fields.Device;
      if (!device) return;
      const ext = extractExt(device);
      const state = normalizeState(fields.State);
      const cur = this.devices.get(device) ?? {
        device,
        extension: ext,
        state: 'unknown' as DeviceState,
        contact: null,
        reachable: null,
        updatedAt: new Date().toISOString(),
      };
      cur.state = state;
      cur.updatedAt = new Date().toISOString();
      this.devices.set(device, cur);
      this.emit('change', cur);
    } else if (event === 'ContactStatus' || event === 'ContactStatusDetail') {
      // PJSIP の register 状態 (Reachable/Unreachable)
      const ao = fields.AOR ?? fields.Aor;
      const status = fields.Status ?? fields.ContactStatus;
      const uri = fields.URI;
      if (!ao) return;
      const device = `PJSIP/${ao}`;
      const cur = this.devices.get(device) ?? {
        device,
        extension: ao,
        state: 'unknown' as DeviceState,
        contact: null,
        reachable: null,
        updatedAt: new Date().toISOString(),
      };
      cur.contact = uri ?? cur.contact;
      cur.reachable = status === 'Reachable' || status === 'Created' || status === 'Updated';
      cur.updatedAt = new Date().toISOString();
      // ContactStatus 単独では state を変えない (DeviceState 側で管理)
      this.devices.set(device, cur);
      this.emit('change', cur);
    } else if (event === 'EndpointList' || event === 'EndpointDetail') {
      const ao = fields.Aor ?? fields.ObjectName;
      if (!ao || !/^[0-9]+$/.test(ao)) return;
      const device = `PJSIP/${ao}`;
      if (!this.devices.has(device)) {
        this.devices.set(device, {
          device,
          extension: ao,
          state: 'unknown',
          contact: null,
          reachable: null,
          updatedAt: new Date().toISOString(),
        });
        this.emit('change', this.devices.get(device)!);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

// シングルトン (HMR / re-import で複数化しないように globalThis に保存)
const KEY = '__commandRoomAmi';
function getClient(): AmiClient {
  const g = globalThis as unknown as Record<string, AmiClient | undefined>;
  if (!g[KEY]) {
    g[KEY] = new AmiClient();
    g[KEY]!.start();
  }
  return g[KEY]!;
}

export function amiClient(): AmiClient {
  return getClient();
}

export function listDevices(): DeviceInfo[] {
  return getClient().getDevices();
}

export function amiIsReady(): boolean {
  return getClient().isConnected();
}

// ---- Edge Fleet PBX Safety Kernel (ADR 0018 §D) ----
//
// Device states that indicate a device is busy on a call. RINGING (inbound,
// not yet answered) is counted as activity too, so the restart guard errs
// toward deferring rather than cutting a call that is about to connect.
const ACTIVE_CALL_STATES: ReadonlySet<DeviceState> = new Set<DeviceState>([
  'inuse',
  'busy',
  'ringinuse',
  'onhold',
  'ringing',
]);

export interface ActiveCallSummary {
  /** Number of devices currently in an active-call state. */
  activeDevices: number;
  /** True if any device is on / ringing a call right now. */
  anyActiveCall: boolean;
}

/** Pure summarizer — testable without a live AMI connection. */
export function summarizeActiveCalls(devices: DeviceInfo[]): ActiveCallSummary {
  const activeDevices = devices.filter((d) =>
    ACTIVE_CALL_STATES.has(d.state),
  ).length;
  return { activeDevices, anyActiveCall: activeDevices > 0 };
}

/** Live summary from the shared AMI client's tracked device map. */
export function activeCallSummary(): ActiveCallSummary {
  return summarizeActiveCalls(listDevices());
}

// ---- Channel / recording tracking (ADR 0018 §D) ----
//
// Device state (above) only sees PJSIP endpoints. Channels additionally cover
// trunk / IVR / Local legs that have no device state, so the channel count is
// the more complete "is a call in progress" signal for the restart guard.

export interface ChannelInfo {
  uniqueid: string;
  channel: string; // e.g. "PJSIP/1001-00000001"
  state: string; // ChannelStateDesc, e.g. "Up" / "Ring" / "Ringing"
}

export interface ChannelActivitySummary {
  /** Number of live channel legs (Newchannel without a matching Hangup). */
  activeChannels: number;
  /** True if any channel leg is currently up. */
  anyActiveCall: boolean;
  /** True if any MixMonitor recording is currently open. */
  recordingActive: boolean;
  /** Number of open MixMonitor recordings. */
  recordingCount: number;
}

/**
 * Parse one AMI block ("Key: Value" lines separated by \r\n) into a flat
 * record. Lines without a colon are ignored. Pure / testable.
 */
export function parseAmiBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value;
  }
  return fields;
}

/**
 * Apply a single AMI event to the channel / recording maps. No-op for events
 * that are not channel- or recording-lifecycle related. Pure mutation of the
 * passed-in collections so it can be unit-tested without a live socket.
 */
export function applyChannelEvent(
  channels: Map<string, ChannelInfo>,
  recordings: Set<string>,
  fields: Record<string, string>,
): void {
  const event = fields.Event;
  const uniqueid = fields.Uniqueid;
  if (!event || !uniqueid) return;
  switch (event) {
    case 'Newchannel':
    case 'CoreShowChannel':
      channels.set(uniqueid, {
        uniqueid,
        channel: fields.Channel ?? '',
        state: fields.ChannelStateDesc ?? '',
      });
      return;
    case 'Newstate': {
      const cur = channels.get(uniqueid);
      if (cur) cur.state = fields.ChannelStateDesc ?? cur.state;
      else
        channels.set(uniqueid, {
          uniqueid,
          channel: fields.Channel ?? '',
          state: fields.ChannelStateDesc ?? '',
        });
      return;
    }
    case 'Hangup':
      channels.delete(uniqueid);
      // Defensive: clear any recording too in case MixMonitorStop was missed,
      // so a dropped stop event can't leak a permanent "recording active".
      recordings.delete(uniqueid);
      return;
    case 'MixMonitorStart':
      recordings.add(uniqueid);
      return;
    case 'MixMonitorStop':
      recordings.delete(uniqueid);
      return;
    default:
      return;
  }
}

/** Pure summarizer — testable without a live AMI connection. */
export function summarizeChannels(
  channels: Iterable<ChannelInfo>,
  recordings: ReadonlySet<string>,
): ChannelActivitySummary {
  let activeChannels = 0;
  for (const _c of channels) activeChannels++;
  const recordingCount = recordings.size;
  return {
    activeChannels,
    anyActiveCall: activeChannels > 0,
    recordingActive: recordingCount > 0,
    recordingCount,
  };
}

/** Live channel/recording summary from the shared AMI client. */
export function channelActivitySummary(): ChannelActivitySummary {
  return getClient().channelSummary();
}

// ---- Parked calls (#7 で park、701-720 で取り出し) ----

export interface ParkedCall {
  parkingSpace: string; // "701" 等。ここにダイヤルすると取り出せる
  channel: string; // 駐車中チャネル
  callerIdNum: string;
  callerIdName: string;
  timeoutSeconds: number | null; // 駐車の制限時間 (res_parking.conf parkingtime)
  durationSeconds: number; // 駐車してからの経過秒 (スナップショット時点)
}

/** Parse one AMI ParkedCall event into a ParkedCall. Pure / testable. */
export function parseParkedCallEvent(fields: Record<string, string>): ParkedCall | null {
  const space = fields.ParkingSpace;
  if (!space) return null;
  return {
    parkingSpace: space,
    channel: fields.ParkeeChannel ?? '',
    callerIdNum: fields.ParkeeCallerIDNum ?? '',
    callerIdName: fields.ParkeeCallerIDName ?? '',
    timeoutSeconds: fields.ParkingTimeout ? Number(fields.ParkingTimeout) || null : null,
    durationSeconds: Number(fields.ParkingDuration) || 0,
  };
}

const PARKING_REMOVE_EVENTS = new Set(['UnParkedCall', 'ParkedCallGiveUp', 'ParkedCallTimeOut']);

/**
 * Apply a parking AMI event to the parked map. Returns true if it handled a
 * parking event (so the caller can emit a change). Pure mutation.
 */
export function applyParkingEvent(
  parked: Map<string, ParkedCall>,
  fields: Record<string, string>,
): boolean {
  const event = fields.Event;
  const space = fields.ParkingSpace;
  if (!event || !space) return false;
  if (event === 'ParkedCall') {
    const pc = parseParkedCallEvent(fields);
    if (pc) parked.set(space, pc);
    return true;
  }
  if (PARKING_REMOVE_EVENTS.has(event)) {
    parked.delete(space);
    return true;
  }
  return false;
}

/** Live parked-call list from the shared AMI client. */
export function listParkedCalls(): ParkedCall[] {
  return getClient().getParkedCalls();
}
