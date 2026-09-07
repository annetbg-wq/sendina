import net from 'node:net';

const targets = [
  {host: 'smtp.gmail.com', port: 465},
  {host: 'smtp.gmail.com', port: 587},
  {host: 'imap.gmail.com', port: 993},
];

const timeoutMs = Number(process.env.MAIL_NETWORK_PROBE_TIMEOUT_MS ?? 5000);

const probe = ({host, port}) => new Promise(resolve => {
  const started = Date.now();
  const socket = net.createConnection({host, port});
  let done = false;
  const finish = (ok, detail) => {
    if (done) return;
    done = true;
    socket.destroy();
    resolve({host, port, ok, ms: Date.now() - started, detail});
  };
  socket.setTimeout(timeoutMs, () => finish(false, `timeout after ${timeoutMs}ms`));
  socket.once('connect', () => finish(true, 'tcp connected'));
  socket.once('error', error => finish(false, `${error.code ?? 'ERROR'}: ${error.message}`));
});

const results = await Promise.all(targets.map(probe));
for (const result of results) console.log(JSON.stringify(result));

if (results.some(result => !result.ok)) process.exitCode = 2;
