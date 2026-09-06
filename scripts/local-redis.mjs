/**
 * Redis through WSL, for machines that cannot run Docker.
 *
 * Docker Desktop needs WSL2 or Hyper-V, and both need hardware virtualization
 * enabled in firmware. WSL1 does not — it translates syscalls instead of
 * running a VM — so a real Redis can live there and listen on a port Windows
 * can reach.
 *
 *   node scripts/local-redis.mjs           # start in the foreground
 *   node scripts/local-redis.mjs --setup   # install it into the distro first
 */
import { spawn, spawnSync } from 'node:child_process';

const DISTRO = process.env.WSL_DISTRO ?? 'Ubuntu';

function wsl(args, options = {}) {
  return spawnSync('wsl.exe', ['-d', DISTRO, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

if (process.argv.includes('--setup')) {
  console.log(`installing redis-server into ${DISTRO}…`);
  const install = wsl(
    ['-u', 'root', '--', 'bash', '-lc', 'apt-get update -qq && apt-get install -y -qq redis-server'],
    { stdio: 'inherit' },
  );
  process.exit(install.status ?? 0);
}

const check = wsl(['--', 'sh', '-c', 'command -v redis-server']);
if (!check.stdout?.trim()) {
  console.error(`redis-server is not in ${DISTRO}. Run: node scripts/local-redis.mjs --setup`);
  process.exit(1);
}

/*
 * bind 0.0.0.0 and protected-mode off so the port is reachable from Windows.
 * That is safe here and only here: WSL1 shares the host's loopback, so this
 * listens on the developer's own machine and nothing else. Never these flags
 * on anything with a route to the outside.
 */
const redis = spawn(
  'wsl.exe',
  ['-d', DISTRO, '-u', 'root', '--', 'redis-server', '--bind', '0.0.0.0', '--protected-mode', 'no'],
  { stdio: 'inherit' },
);

const stop = () => {
  redis.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
