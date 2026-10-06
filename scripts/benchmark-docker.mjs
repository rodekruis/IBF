#!/usr/bin/env node

import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return defaultValue;
}

const outputPath = resolve(process.cwd(), getArg('--output', getArg('-o', 'docker-benchmark.json')));
const settleSeconds = Number.parseInt(getArg('--settle', getArg('-s', '10')), 10);
const timeoutSeconds = Number.parseInt(getArg('--timeout', getArg('-t', '180')), 10);
const profile = getArg('--profile', 'development');
const shouldBuild = !args.includes('--no-build');
const shouldStop = !args.includes('--no-stop');

const trackedServices = ['ibf-db', 'api-service', 'pg_tileserv', 'pg_featureserv'];
const servicesDir = resolve(process.cwd(), 'services');

// Read PORT_API_SERVICE from services/.env or fallback to services/.env.example or 4000
function getApiPort() {
  const envPath = resolve(servicesDir, '.env');
  const envExamplePath = resolve(servicesDir, '.env.example');
  const targetPath = existsSync(envPath) ? envPath : existsSync(envExamplePath) ? envExamplePath : null;

  if (targetPath) {
    const content = readFileSync(targetPath, 'utf8');
    const match = content.match(/^PORT_API_SERVICE\s*=\s*([0-9]+)/m);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }
  return 4000;
}

const apiPort = getApiPort();

// Helper to convert size string like "123.4MiB", "1.2GiB", "500kB" to bytes
function parseBytes(str) {
  if (!str) return 0;
  const match = str.trim().match(/^([0-9.]+)\s*([a-zA-Z]+)?$/);
  if (!match) return 0;
  const val = Number.parseFloat(match[1]);
  const unit = (match[2] || 'B').toLowerCase();

  const binaryUnits = {
    b: 1,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
  };

  return Math.round(val * (binaryUnits[unit] || 1));
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

function parsePercent(str) {
  if (!str) return 0;
  return Number.parseFloat(str.replace('%', '').trim()) || 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getComposeArgs(subcommand, extraArgs = []) {
  const composeFiles =
    profile === 'development'
      ? ['-f', 'docker-compose.yml', '-f', 'docker-compose.development.yml']
      : ['-f', 'docker-compose.yml'];
  return ['compose', ...composeFiles, subcommand, ...extraArgs];
}

async function getDockerVersion() {
  try {
    const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

async function inspectContainers(containerNames) {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '--format',
      '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
      ...containerNames,
    ]);

    const results = {};
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      const [rawName, status, health] = line.split('|');
      const name = rawName.replace(/^\//, '');
      results[name] = { status, health };
    }
    return results;
  } catch {
    return {};
  }
}

async function sampleDockerStats() {
  try {
    const { stdout } = await execFileAsync('docker', [
      'stats',
      '--no-stream',
      '--format',
      '{{json .}}',
      ...trackedServices,
    ]);

    const stats = {};
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      try {
        const item = JSON.parse(line);
        const name = item.Name?.replace(/^\//, '');
        if (!name) continue;

        // MemUsage format: "123.4MiB / 7.669GiB"
        const [usedStr, limitStr] = (item.MemUsage || '').split('/').map((s) => s.trim());

        stats[name] = {
          usedBytes: parseBytes(usedStr),
          limitBytes: parseBytes(limitStr),
          cpuPercent: parsePercent(item.CPUPerc),
          pids: Number.parseInt(item.PIDs, 10) || 0,
        };
      } catch {
        // ignore malformed JSON line
      }
    }
    return stats;
  } catch {
    return {};
  }
}

async function checkApiHealth(port) {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Docker Virtualization Benchmark ===');
  console.log(`Profile: ${profile}`);
  console.log(`Tracked Services: ${trackedServices.join(', ')}`);
  console.log(`API Healthcheck Port: ${apiPort}`);

  const dockerVersion = await getDockerVersion();

  if (shouldStop) {
    console.log('\nStopping existing containers for baseline cold-start...');
    try {
      execFileSync('docker', getComposeArgs('stop'), {
        cwd: servicesDir,
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn('Warning when stopping containers:', err.message);
    }
  }

  const serviceMetrics = {};
  for (const name of trackedServices) {
    serviceMetrics[name] = {
      timeToRunningMs: null,
      timeToHealthyMs: null,
      timeToHttpReadyMs: null,
      initialBytes: 0,
      peakBytes: 0,
      idleBytes: 0,
      limitBytes: 0,
      peakCpuPercent: 0,
      pids: 0,
    };
  }

  const timeline = [];
  function addTimelineEvent(event, relativeMs) {
    timeline.push({ timestampMs: Math.round(relativeMs), event });
    console.log(`[+${(relativeMs / 1000).toFixed(2)}s] ${event}`);
  }

  const startTime = performance.now();
  addTimelineEvent('docker compose up initiated', 0);

  const upArgs = getComposeArgs('up', ['-d', ...(shouldBuild ? ['--build'] : [])]);
  console.log(`Executing: docker ${upArgs.join(' ')}`);

  const upProcess = spawn('docker', upArgs, {
    cwd: servicesDir,
    stdio: 'inherit',
  });

  await new Promise((resolvePromise, rejectPromise) => {
    upProcess.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`docker compose up exited with code ${code}`));
    });
  });

  addTimelineEvent('docker compose up completed', performance.now() - startTime);

  // Monitor until healthy or timeout
  console.log('\nMonitoring service milestones and sampling memory...');
  const timeoutMs = timeoutSeconds * 1000;
  let allHealthy = false;
  let httpReady = false;

  while (performance.now() - startTime < timeoutMs) {
    const elapsed = performance.now() - startTime;

    // Inspect container states
    const states = await inspectContainers(trackedServices);
    for (const [name, state] of Object.entries(states)) {
      const metric = serviceMetrics[name];
      if (!metric) continue;

      if (state.status === 'running' && metric.timeToRunningMs === null) {
        metric.timeToRunningMs = Math.round(elapsed);
        addTimelineEvent(`${name} status: running`, elapsed);
      }

      if (state.health === 'healthy' && metric.timeToHealthyMs === null) {
        metric.timeToHealthyMs = Math.round(elapsed);
        addTimelineEvent(`${name} health: healthy`, elapsed);
      }
    }

    // Check API HTTP endpoint
    if (!httpReady) {
      const isHttpOk = await checkApiHealth(apiPort);
      if (isHttpOk) {
        httpReady = true;
        serviceMetrics['api-service'].timeToHttpReadyMs = Math.round(elapsed);
        addTimelineEvent('api-service HTTP /api/health responding 200', elapsed);
      }
    }

    // Sample stats
    const stats = await sampleDockerStats();
    for (const [name, stat] of Object.entries(stats)) {
      const metric = serviceMetrics[name];
      if (!metric) continue;

      if (metric.initialBytes === 0 && stat.usedBytes > 0) {
        metric.initialBytes = stat.usedBytes;
      }
      if (stat.usedBytes > metric.peakBytes) {
        metric.peakBytes = stat.usedBytes;
      }
      if (stat.limitBytes > 0) {
        metric.limitBytes = stat.limitBytes;
      }
      if (stat.cpuPercent > metric.peakCpuPercent) {
        metric.peakCpuPercent = stat.cpuPercent;
      }
      metric.pids = stat.pids;
    }

    // Determine completion:
    // ibf-db healthy, api-service healthy (or httpReady), pg_* running
    const dbHealthy = states['ibf-db']?.health === 'healthy';
    const apiHealthy = states['api-service']?.health === 'healthy' || httpReady;
    const tileservRunning = states['pg_tileserv']?.status === 'running';
    const featureservRunning = states['pg_featureserv']?.status === 'running';

    if (dbHealthy && apiHealthy && tileservRunning && featureservRunning) {
      allHealthy = true;
      break;
    }

    await sleep(500);
  }

  const startupDurationMs = Math.round(performance.now() - startTime);

  if (!allHealthy) {
    console.warn(`\nWarning: Timed out waiting for all services after ${timeoutSeconds}s.`);
  } else {
    addTimelineEvent('All core services ready and healthy', startupDurationMs);
  }

  // Settling period to measure idle memory
  if (settleSeconds > 0) {
    console.log(`\nSettling for ${settleSeconds}s to measure idle/resting memory usage...`);
    const settleEnd = performance.now() + settleSeconds * 1000;
    while (performance.now() < settleEnd) {
      const stats = await sampleDockerStats();
      for (const [name, stat] of Object.entries(stats)) {
        const metric = serviceMetrics[name];
        if (!metric) continue;

        if (stat.usedBytes > metric.peakBytes) {
          metric.peakBytes = stat.usedBytes;
        }
        metric.idleBytes = stat.usedBytes;
        if (stat.cpuPercent > metric.peakCpuPercent) {
          metric.peakCpuPercent = stat.cpuPercent;
        }
      }
      await sleep(1000);
    }
  }

  // Final summary calculation
  let totalPeakBytes = 0;
  let totalIdleBytes = 0;
  const servicesResult = {};

  for (const [name, metric] of Object.entries(serviceMetrics)) {
    totalPeakBytes += metric.peakBytes;
    totalIdleBytes += metric.idleBytes || metric.peakBytes;

    servicesResult[name] = {
      timeToRunningMs: metric.timeToRunningMs,
      timeToHealthyMs: metric.timeToHealthyMs,
      timeToHttpReadyMs: metric.timeToHttpReadyMs,
      memory: {
        initialBytes: metric.initialBytes,
        peakBytes: metric.peakBytes,
        idleBytes: metric.idleBytes || metric.peakBytes,
        limitBytes: metric.limitBytes,
        initialFormatted: formatBytes(metric.initialBytes),
        peakFormatted: formatBytes(metric.peakBytes),
        idleFormatted: formatBytes(metric.idleBytes || metric.peakBytes),
        limitFormatted: formatBytes(metric.limitBytes),
      },
      cpu: {
        peakPercent: Number(metric.peakCpuPercent.toFixed(1)),
      },
      pids: metric.pids,
    };
  }

  const report = {
    metadata: {
      timestamp: new Date().toISOString(),
      platform: `${platform()}-${arch()}`,
      dockerVersion,
      composeProfile: profile,
      builtOnStart: shouldBuild,
    },
    summary: {
      totalStartupDurationMs: startupDurationMs,
      totalStartupDurationSeconds: Number((startupDurationMs / 1000).toFixed(2)),
      totalPeakMemoryBytes: totalPeakBytes,
      totalIdleMemoryBytes: totalIdleBytes,
      totalPeakMemoryFormatted: formatBytes(totalPeakBytes),
      totalIdleMemoryFormatted: formatBytes(totalIdleBytes),
    },
    services: servicesResult,
    timeline,
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n================ Benchmark Results ================');
  console.log(`Total Startup Duration : ${(startupDurationMs / 1000).toFixed(2)}s`);
  console.log(`Total Peak Memory      : ${formatBytes(totalPeakBytes)}`);
  console.log(`Total Idle Memory      : ${formatBytes(totalIdleBytes)}`);
  console.log('---------------------------------------------------');
  console.log('Service breakdown:');
  for (const [name, data] of Object.entries(servicesResult)) {
    const ready = data.timeToHealthyMs ?? data.timeToHttpReadyMs ?? data.timeToRunningMs ?? 'N/A';
    console.log(
      ` - ${name.padEnd(16)} | Ready: ${String(ready).padStart(5)}ms | Peak: ${data.memory.peakFormatted.padStart(9)} | Idle: ${data.memory.idleFormatted.padStart(9)} | Peak CPU: ${data.cpu.peakPercent}%`,
    );
  }
  console.log('---------------------------------------------------');
  console.log(`Report written to: ${outputPath}`);
}

main().catch((err) => {
  console.error('\nBenchmark failed:', err);
  process.exit(1);
});
