// # 自动递增版本：1.0.0 → 1.0.1 → ... → 1.0.9 → 1.1.0
// npm run release:version
// 自动提交所有未提交文件并创建本地标签，不推送远程

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const appConfigPath = path.join(rootDir, 'app.json');
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

function incrementVersion(currentVersion) {
  const currentMatch = currentVersion.match(versionPattern);

  if (!currentMatch) {
    throw new Error(`Cannot increment invalid current version: ${currentVersion}`);
  }

  const [, major, minor, patch] = currentMatch.map(Number);

  if (patch < 9) return `${major}.${minor}.${patch + 1}`;
  if (minor < 9) return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const appConfig = JSON.parse(await fs.readFile(appConfigPath, 'utf8'));

  const currentVersion = appConfig.expo?.version;
  const currentVersionCode = appConfig.expo?.android?.versionCode;

  if (typeof currentVersion !== 'string') {
    throw new Error('Missing expo.version in app.json.');
  }

  if (!Number.isInteger(currentVersionCode) || currentVersionCode < 1) {
    throw new Error('expo.android.versionCode must be a positive integer.');
  }

  const nextVersion = incrementVersion(currentVersion);
  const nextVersionCode = currentVersionCode + 1;
  const releaseTag = `v${nextVersion}`;
  const releaseMessage = `chore(release): ${releaseTag}`;

  const { stdout: existingTag } = await execFileAsync(
    'git',
    ['tag', '--list', releaseTag],
    { cwd: rootDir }
  );

  if (existingTag.trim()) {
    throw new Error(`Git tag already exists: ${releaseTag}`);
  }

  appConfig.expo.version = nextVersion;
  appConfig.expo.ios.buildNumber = nextVersion;
  appConfig.expo.android.versionCode = nextVersionCode;

  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error('Run this script with npm run release:version.');
  }

  await execFileAsync(
    process.execPath,
    [npmExecPath, 'version', nextVersion, '--no-git-tag-version', '--allow-same-version'],
    { cwd: rootDir }
  );
  await fs.writeFile(appConfigPath, serializeJson(appConfig), 'utf8');

  await execFileAsync('git', ['add', '--all'], { cwd: rootDir });
  await execFileAsync('git', ['commit', '-m', releaseMessage], { cwd: rootDir });
  await execFileAsync('git', ['tag', '-a', releaseTag, '-m', releaseMessage], { cwd: rootDir });

  console.log(`Version: ${currentVersion} -> ${nextVersion}`);
  console.log(`Android versionCode: ${currentVersionCode} -> ${nextVersionCode}`);
  console.log(`Release commit and tag created: ${releaseTag}`);
  console.log(`Push manually: git push origin HEAD ${releaseTag}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
