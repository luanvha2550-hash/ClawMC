// src/utils/environmentCheck.js

import fs from 'fs';
import os from 'os';

/**
 * Check the environment for required dependencies and configurations
 * @returns {Promise<{
 *   nodeVersion: string,
 *   hasIsolatedVM: boolean,
 *   totalRAM: number,
 *   freeRAM: number,
 *   platform: string,
 *   arch: string,
 *   issues: string[],
 *   isReady: boolean
 * }>}
 */
export async function checkEnvironment() {
  const issues = [];

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0], 10);

  if (majorVersion < 18) {
    issues.push(`Node.js ${nodeVersion} muito antigo. Recomendado: 18.x ou 20.x`);
  }

  // 2. isolated-vm availability (optional)
  let hasIsolatedVM = false;
  try {
    require('isolated-vm');
    hasIsolatedVM = true;
  } catch (e) {
    issues.push('isolated-vm nao disponivel. Sandbox alternativo (SES) sera usado.');
  }

  // 3. better-sqlite3
  try {
    require('better-sqlite3');
  } catch (e) {
    issues.push('better-sqlite3 nao disponivel. Verifique instalacao.');
  }

  // 4. sqlite-vec
  try {
    require('sqlite-vec');
  } catch (e) {
    issues.push('sqlite-vec nao disponivel. Busca semantica nao funcionara.');
  }

  // 5. Available RAM
  const totalRAM = os.totalmem();
  const freeRAM = os.freemem();
  const totalRAMGB = Math.round(totalRAM / (1024 * 1024 * 1024));
  const freeRAMGB = Math.round(freeRAM / (1024 * 1024 * 1024));

  if (totalRAMGB < 6) {
    issues.push(`RAM total: ${totalRAMGB}GB. Recomendado: 8GB+`);
  }

  // 6. Data directory
  try {
    fs.mkdirSync('./data', { recursive: true });
  } catch (e) {
    issues.push('Nao foi possivel criar diretorio ./data');
  }

  // 7. Logs directory
  try {
    fs.mkdirSync('./logs', { recursive: true });
  } catch (e) {
    issues.push('Nao foi possivel criar diretorio ./logs');
  }

  // 8. .env file
  if (!fs.existsSync('./.env')) {
    if (fs.existsSync('./.env.example')) {
      issues.push('.env nao encontrado. Copie .env.example para .env e configure as chaves.');
    } else {
      issues.push('.env nao encontrado.');
    }
  }

  return {
    nodeVersion,
    hasIsolatedVM,
    totalRAM: totalRAMGB,
    freeRAM: freeRAMGB,
    platform: process.platform,
    arch: process.arch,
    issues,
    isReady: issues.filter(i =>
      !i.includes('isolated-vm') &&
      !i.includes('.env')
    ).length === 0
  };
}

/**
 * Print environment report to console
 * @param {Object} report - Environment report from checkEnvironment()
 */
export function printEnvironmentReport(report) {
  console.log('\n=== Environment Report ===\n');
  console.log(`Node.js: ${report.nodeVersion}`);
  console.log(`Platform: ${report.platform} (${report.arch})`);
  console.log(`RAM: ${report.totalRAM}GB total, ${report.freeRAM}GB free`);
  console.log(`isolated-vm: ${report.hasIsolatedVM ? '\u2713' : '\u2717'}`);

  if (report.issues.length > 0) {
    console.log('\n\u26A0 Issues:');
    report.issues.forEach(issue => console.log(`  - ${issue}`));
  } else {
    console.log('\n\u2713 All checks passed');
  }

  console.log(`\nReady: ${report.isReady ? '\u2713 Yes' : '\u2717 No'}\n`);
}