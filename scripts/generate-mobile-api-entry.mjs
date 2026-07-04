import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const apiModulesDir = path.join(rootDir, 'api', 'module');
const generatedDir = path.join(rootDir, 'src', 'lib', 'kugou-api', 'generated');
const generatedJsPath = path.join(generatedDir, 'modules.js');
const generatedDtsPath = path.join(generatedDir, 'modules.d.ts');

function createModulesJs(moduleNames) {
  const lines = [
    "'use strict';",
    '',
    'const generatedModuleNames = Object.freeze([',
    ...moduleNames.map((name) => `  '${name}',`),
    ']);',
    '',
    'const modules = {',
    ...moduleNames.map(
      (name) =>
        `  ${JSON.stringify(name)}: (params, useAxios) => require(${JSON.stringify(`../../../../api/module/${name}.js`)})(params, useAxios),`
    ),
    '};',
    '',
    'module.exports = { generatedModuleNames, modules };',
    '',
  ];

  return lines.join('\n');
}

function createModulesDts(moduleNames) {
  const union = moduleNames.length === 0 ? 'never' : moduleNames.map((name) => `  | '${name}'`).join('\n');
  const lines = [
    "import type { RawApiModule } from '../types';",
    '',
    'export type GeneratedModuleName =',
    `${union};`,
    '',
    'export declare const generatedModuleNames: readonly GeneratedModuleName[];',
    'export declare const modules: Record<GeneratedModuleName, RawApiModule>;',
    '',
  ];

  return lines.join('\n');
}

async function main() {
  const entries = await fs.readdir(apiModulesDir, { withFileTypes: true });
  const moduleNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_'))
    .map((entry) => entry.name.replace(/\.js$/i, ''))
    .sort((left, right) => left.localeCompare(right));

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(generatedJsPath, createModulesJs(moduleNames), 'utf8');
  await fs.writeFile(generatedDtsPath, createModulesDts(moduleNames), 'utf8');

  console.log(`generated ${moduleNames.length} mobile api wrappers`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
