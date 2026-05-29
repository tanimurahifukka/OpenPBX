import { describe, expect, it } from 'vitest';
import { renderTransportConfig, renderPjsipConfig, type Extension } from '../extensions';
import type { NetworkSettings } from '../network';

function net(over: Partial<NetworkSettings> = {}): NetworkSettings {
  return { externalIp: null, externalSignalingIp: null, localNet: null, updatedAt: '', ...over };
}

function ext(over: Partial<Extension> = {}): Extension {
  return {
    number: '1001',
    displayName: 'Reception',
    secret: 'sec1',
    note: null,
    webrtc: false,
    updatedAt: '',
    ...over,
  };
}

const noPickup = () => [] as string[];

describe('renderTransportConfig', () => {
  it('emits udp / tcp / wss transport sections', () => {
    const out = renderTransportConfig(net());
    expect(out).toContain('[transport-udp]');
    expect(out).toContain('[transport-tcp]');
    expect(out).toContain('[transport-wss]');
  });

  it('emits the shared endpoint / auth / aor templates', () => {
    const out = renderTransportConfig(net());
    expect(out).toContain('[endpoint-internal](!)');
    expect(out).toContain('[endpoint-webrtc](!)');
    expect(out).toContain('[auth-userpass](!)');
    expect(out).toContain('[aor-single](!)');
  });

  it('omits external_* lines when network settings are empty', () => {
    const out = renderTransportConfig(net());
    expect(out).not.toContain('external_media_address');
    expect(out).not.toContain('external_signaling_address');
  });

  it('injects external_media_address and falls back signaling to external_ip', () => {
    const out = renderTransportConfig(net({ externalIp: '100.64.0.1' }));
    expect(out).toContain('external_media_address=100.64.0.1');
    expect(out).toContain('external_signaling_address=100.64.0.1');
  });

  it('uses a distinct external_signaling_address when provided', () => {
    const out = renderTransportConfig(net({ externalIp: '100.64.0.1', externalSignalingIp: '203.0.113.5' }));
    expect(out).toContain('external_media_address=100.64.0.1');
    expect(out).toContain('external_signaling_address=203.0.113.5');
  });

  it('splits a comma-separated local_net into multiple local_net lines', () => {
    const out = renderTransportConfig(net({ localNet: '192.168.1.0/24, 10.0.0.0/8' }));
    expect(out).toContain('local_net=192.168.1.0/24');
    expect(out).toContain('local_net=10.0.0.0/8');
  });
});

describe('renderPjsipConfig', () => {
  it('emits endpoint + auth + aor sections per extension', async () => {
    const out = await renderPjsipConfig([ext()], noPickup);
    expect(out).toContain('[1001](endpoint-internal)');
    expect(out).toContain('[auth1001](auth-userpass)');
    expect(out).toContain('username=1001');
    expect(out).toContain('password=sec1');
    expect(out).toContain('[1001](aor-single)');
  });

  it('uses the webrtc endpoint template when webrtc=true', async () => {
    const out = await renderPjsipConfig([ext({ webrtc: true })], noPickup);
    expect(out).toContain('[1001](endpoint-webrtc)');
    expect(out).not.toContain('[1001](endpoint-internal)');
  });

  it('strips double-quotes from the display name in callerid', async () => {
    const out = await renderPjsipConfig([ext({ displayName: 'He "Q" Name' })], noPickup);
    expect(out).toContain('callerid="He Q Name" <1001>');
  });

  it('falls back to "Ext <number>" callerid when display name is null', async () => {
    const out = await renderPjsipConfig([ext({ displayName: null })], noPickup);
    expect(out).toContain('callerid="Ext 1001" <1001>');
  });

  it('emits named_call_group / named_pickup_group only when the extension is in a pickup group', async () => {
    const withGroup = await renderPjsipConfig([ext()], () => ['nurses']);
    expect(withGroup).toContain('named_call_group=nurses');
    expect(withGroup).toContain('named_pickup_group=nurses');
    const without = await renderPjsipConfig([ext()], noPickup);
    expect(without).not.toContain('named_call_group');
  });
});
