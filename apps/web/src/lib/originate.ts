// AMI Originate でクリックトゥコールを発火する。
// internal context の `<from>` を呼び出して、応答したら `<to>` に転送する。

import net from 'node:net';

const HOST = process.env.AMI_HOST ?? 'asterisk';
const PORT = Number(process.env.AMI_PORT ?? '5038');
const USERNAME = process.env.AMI_USERNAME ?? 'command-room';
const SECRET = process.env.AMI_SECRET ?? 'command-room-ami-secret';

export async function originate(opts: {
  from: string;          // 内線番号 (= まず呼び出す端末)
  to: string;            // 発信先
  context?: string;
  callerId?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; raw: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT }, () => {});
    let buf = '';
    let stage: 'greeting' | 'login' | 'originate' | 'done' = 'greeting';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('AMI originate timeout'));
    }, opts.timeoutMs ?? 8000);
    socket.setEncoding('utf-8');
    socket.on('data', (chunk: string) => {
      buf += chunk;
      if (stage === 'greeting' && buf.includes('Asterisk Call Manager')) {
        stage = 'login';
        send({
          Action: 'Login',
          Username: USERNAME,
          Secret: SECRET,
          Events: 'off',
        });
        buf = '';
      } else if (stage === 'login' && /Response: (Success|Error)/.test(buf)) {
        const ok = /Response: Success/.test(buf);
        if (!ok) {
          clearTimeout(timer);
          socket.destroy();
          return reject(new Error('AMI login failed'));
        }
        stage = 'originate';
        send({
          Action: 'Originate',
          Channel: `PJSIP/${opts.from}`,
          Context: opts.context ?? 'internal',
          Exten: opts.to,
          Priority: '1',
          Timeout: '30000',
          CallerID: opts.callerId ?? `Click <${opts.from}>`,
          Async: 'true',
        });
        buf = '';
      } else if (stage === 'originate' && /Response: (Success|Error)/.test(buf)) {
        const ok = /Response: Success/.test(buf);
        stage = 'done';
        clearTimeout(timer);
        const raw = buf;
        send({ Action: 'Logoff' });
        socket.end();
        resolve({ ok, raw });
      }
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    function send(fields: Record<string, string>) {
      socket.write(
        Object.entries(fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') + '\r\n\r\n',
      );
    }
  });
}
