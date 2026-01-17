#!/usr/bin/env node
/**
 * Finspark 投资分析 - 数据库初始化脚本
 * 
 * 功能：
 * 1. 检查数据库状态
 * 2. 执行数据库迁移（创建所有必需的表）
 * 3. 导入种子数据
 * 4. 可选：执行全量股票同步
 * 
 * 使用方法：
 *   node scripts/db-init.mjs [options]
 * 
 * 选项：
 *   --full          完整初始化（迁移+种子+全量同步）
 *   --reset         重置数据库（危险：会删除所有数据）
 *   --migrate-only  仅执行迁移
 *   --seed-only     仅导入种子数据
 *   --sync          包含全量股票同步（需要网络）
 *   --prod          操作生产环境
 *   --verbose       详细日志
 * 
 * @version 2.0.0
 * @date 2026-01-12
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ============================================
// 配置
// ============================================

const CONFIG = {
  DB_NAME: 'genspark-financial-db',
  D1_STATE_DIR: '.wrangler/state/v3/d1',
  MIGRATIONS_DIR: 'migrations',
  SEED_FILES: ['seed.sql', 'seed_more_stocks.sql'],
  ALL_MIGRATIONS_FILE: 'scripts/all_migrations.sql',
};

// ============================================
// 工具函数
// ============================================

const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
  dim: (text) => `\x1b[2m${text}\x1b[0m`,
};

function log(message, type = 'info') {
  const prefix = {
    info: colors.cyan('[DB-INIT]'),
    success: colors.green('[DB-INIT]'),
    warn: colors.yellow('[DB-INIT]'),
    error: colors.red('[DB-INIT]'),
    step: colors.bold('[DB-INIT]'),
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

function runCommand(command, options = {}) {
  const { silent = false, ignoreError = false, cwd = PROJECT_ROOT } = options;
  
  try {
    const result = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    });
    return { success: true, output: result };
  } catch (error) {
    if (ignoreError) {
      return { success: false, error: error.message, output: error.stdout || '' };
    }
    throw error;
  }
}

// ============================================
// 数据库状态检查
// ============================================

function checkD1State(prod = false) {
  if (prod) {
    // 生产环境：通过 API 检查
    log('检查生产环境 D1 数据库状态...');
    return { initialized: true }; // 假设生产环境已存在
  }
  
  // 本地环境：检查状态目录
  const statePath = join(PROJECT_ROOT, CONFIG.D1_STATE_DIR);
  const exists = existsSync(statePath);
  
  log(`本地 D1 状态目录: ${exists ? '存在' : '不存在'}`);
  return { initialized: exists };
}

function getStockCount(prod = false) {
  const envFlag = prod ? '' : '--local';
  
  try {
    const result = execSync(
      `npx wrangler d1 execute ${CONFIG.DB_NAME} ${envFlag} --command="SELECT COUNT(*) as count FROM stocks;" --json`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    
    // 解析 JSON 输出
    const parsed = JSON.parse(result);
    if (parsed && parsed[0] && parsed[0].results && parsed[0].results[0]) {
      return parsed[0].results[0].count;
    }
    return 0;
  } catch (error) {
    // 表可能不存在
    return -1;
  }
}

function getTableList(prod = false) {
  const envFlag = prod ? '' : '--local';
  
  try {
    const result = execSync(
      `npx wrangler d1 execute ${CONFIG.DB_NAME} ${envFlag} --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" --json`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    
    const parsed = JSON.parse(result);
    if (parsed && parsed[0] && parsed[0].results) {
      return parsed[0].results.map(r => r.name).filter(n => !n.startsWith('_') && !n.startsWith('sqlite_'));
    }
    return [];
  } catch (error) {
    return [];
  }
}

// ============================================
// 迁移执行
// ============================================

function runMigrations(prod = false, verbose = false) {
  log('执行数据库迁移...', 'step');
  
  const envFlag = prod ? '' : '--local';
  const migrationsDir = join(PROJECT_ROOT, CONFIG.MIGRATIONS_DIR);
  
  // 方式1: 使用 wrangler d1 migrations apply
  try {
    log('使用 wrangler d1 migrations apply...');
    runCommand(`npx wrangler d1 migrations apply ${CONFIG.DB_NAME} ${envFlag}`, {
      silent: !verbose,
    });
    log('迁移完成', 'success');
    return true;
  } catch (error) {
    log(`wrangler 迁移失败，尝试手动执行: ${error.message}`, 'warn');
  }
  
  // 方式2: 使用合并的迁移文件
  const allMigrationsFile = join(PROJECT_ROOT, CONFIG.ALL_MIGRATIONS_FILE);
  if (existsSync(allMigrationsFile)) {
    try {
      log('使用合并迁移文件...');
      runCommand(`npx wrangler d1 execute ${CONFIG.DB_NAME} ${envFlag} --file=${allMigrationsFile}`, {
        silent: !verbose,
      });
      log('合并迁移执行完成', 'success');
      return true;
    } catch (error) {
      log(`合并迁移失败: ${error.message}`, 'error');
    }
  }
  
  // 方式3: 逐个执行迁移文件
  if (existsSync(migrationsDir)) {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    log(`找到 ${files.length} 个迁移文件`);
    
    for (const file of files) {
      try {
        log(`执行迁移: ${file}`);
        runCommand(`npx wrangler d1 execute ${CONFIG.DB_NAME} ${envFlag} --file=${join(migrationsDir, file)}`, {
          silent: !verbose,
        });
      } catch (error) {
        log(`迁移 ${file} 失败: ${error.message}`, 'warn');
        // 继续执行其他迁移
      }
    }
    
    log('迁移完成', 'success');
    return true;
  }
  
  log('没有找到可执行的迁移文件', 'error');
  return false;
}

// ============================================
// 种子数据导入
// ============================================

function importSeedData(prod = false, verbose = false) {
  log('导入种子数据...', 'step');
  
  const envFlag = prod ? '' : '--local';
  let imported = 0;
  
  for (const seedFile of CONFIG.SEED_FILES) {
    const seedPath = join(PROJECT_ROOT, seedFile);
    
    if (existsSync(seedPath)) {
      try {
        log(`导入: ${seedFile}`);
        runCommand(`npx wrangler d1 execute ${CONFIG.DB_NAME} ${envFlag} --file=${seedPath}`, {
          silent: !verbose,
        });
        imported++;
      } catch (error) {
        log(`导入 ${seedFile} 失败: ${error.message}`, 'warn');
      }
    } else {
      log(`种子文件不存在: ${seedFile}`, 'warn');
    }
  }
  
  if (imported > 0) {
    log(`成功导入 ${imported} 个种子文件`, 'success');
    return true;
  }
  
  log('没有成功导入任何种子数据', 'warn');
  return false;
}

// ============================================
// 全量股票同步
// ============================================

async function syncAllStocks(prod = false, verbose = false, syncType = 'a') {
  // syncType: 'a' = 仅A股, 'hk' = 仅港股, 'all' = A股+港股
  const typeLabels = {
    'a': 'A股 (5400+)',
    'hk': '港股 (2700+)',
    'all': 'A股+港股 (8100+)'
  };
  
  log(`执行全量${typeLabels[syncType] || '股票'}同步...`, 'step');
  
  const syncScript = join(PROJECT_ROOT, 'scripts/sync_all_stocks.mjs');
  
  if (!existsSync(syncScript)) {
    log('同步脚本不存在: scripts/sync_all_stocks.mjs', 'error');
    return false;
  }
  
  try {
    // 根据同步类型构建参数
    if (syncType === 'all') {
      // 全量同步: 先同步港股，再同步A股
      log('第 1 步: 同步港股数据...');
      const hkArgs = ['--full', '--hot', '--hk-stock'];
      if (prod) hkArgs.push('--prod');
      if (verbose) hkArgs.push('--verbose');
      
      runCommand(`node scripts/sync_all_stocks.mjs ${hkArgs.join(' ')}`, {
        silent: false,
      });
      
      log('第 2 步: 同步A股数据...');
      const aArgs = ['--hot', '--a-stock'];  // 不使用 --full，保留港股数据
      if (prod) aArgs.push('--prod');
      if (verbose) aArgs.push('--verbose');
      
      runCommand(`node scripts/sync_all_stocks.mjs ${aArgs.join(' ')}`, {
        silent: false,
      });
    } else {
      const args = ['--full', '--hot'];
      if (syncType === 'hk') {
        args.push('--hk-stock');
        log('正在从 Tushare 获取港股数据，预计需要 10-30 秒...');
      } else {
        args.push('--a-stock');
        log('正在从 Tushare 获取 A 股数据，预计需要 30-60 秒...');
      }
      if (prod) args.push('--prod');
      if (verbose) args.push('--verbose');
      
      runCommand(`node scripts/sync_all_stocks.mjs ${args.join(' ')}`, {
        silent: false,
      });
    }
    
    log(`${typeLabels[syncType] || '股票'}同步完成`, 'success');
    return true;
  } catch (error) {
    log(`同步失败: ${error.message}`, 'error');
    return false;
  }
}

// ============================================
// 数据库重置
// ============================================

function resetDatabase(prod = false, verbose = false) {
  log('⚠️  警告: 即将重置数据库，所有数据将被删除！', 'warn');
  
  if (prod) {
    log('生产环境不支持自动重置，请手动操作', 'error');
    return false;
  }
  
  const envFlag = '--local';
  
  try {
    // 获取所有表
    const tables = getTableList(false);
    
    if (tables.length === 0) {
      log('数据库为空，无需重置', 'info');
      return true;
    }
    
    log(`将删除 ${tables.length} 个表: ${tables.join(', ')}`);
    
    // 删除所有表
    for (const table of tables) {
      try {
        runCommand(`npx wrangler d1 execute ${CONFIG.DB_NAME} ${envFlag} --command="DROP TABLE IF EXISTS ${table};"`, {
          silent: true,
        });
      } catch (error) {
        // 忽略错误
      }
    }
    
    log('数据库已重置', 'success');
    return true;
  } catch (error) {
    log(`重置失败: ${error.message}`, 'error');
    return false;
  }
}

// ============================================
// 状态报告
// ============================================

function printStatus(prod = false) {
  console.log('');
  log('📊 数据库状态报告', 'step');
  console.log('');
  
  const tables = getTableList(prod);
  const stockCount = getStockCount(prod);
  
  console.log(`   环境: ${prod ? '生产' : '本地'}`);
  console.log(`   数据库: ${CONFIG.DB_NAME}`);
  console.log(`   表数量: ${tables.length}`);
  console.log(`   股票数量: ${stockCount >= 0 ? stockCount : '未知'}`);
  
  if (tables.length > 0) {
    console.log('');
    console.log('   数据表列表:');
    
    // 分组显示
    const groups = {
      '核心表': ['stocks', 'stocks_fts', 'users', 'user_sessions'],
      '分析报告': ['analysis_reports', 'comic_reports', 'share_links', 'share_access_logs'],
      '财务数据': ['income_statements', 'balance_sheets', 'cash_flows', 'fina_indicators', 'daily_quotes', 'data_sync_logs'],
      '用户功能': ['user_favorites', 'favorite_groups', 'saved_questions', 'user_preferences', 'user_activity_logs'],
      '会员系统': ['membership_plans', 'membership_orders', 'membership_usage_logs', 'feature_limits'],
      '模型评估': ['model_configs', 'model_evaluations', 'model_comparison_tests', 'model_statistics', 'user_model_preferences'],
      'Agent系统': ['user_agent_presets', 'user_agent_settings'],
    };
    
    for (const [groupName, groupTables] of Object.entries(groups)) {
      const existing = groupTables.filter(t => tables.includes(t));
      const missing = groupTables.filter(t => !tables.includes(t));
      
      if (existing.length > 0 || missing.length > 0) {
        console.log(`     ${groupName}:`);
        if (existing.length > 0) {
          console.log(`       ✓ ${existing.join(', ')}`);
        }
        if (missing.length > 0) {
          console.log(`       ✗ ${colors.red(missing.join(', '))}`);
        }
      }
    }
    
    // 其他表
    const knownTables = Object.values(groups).flat();
    const otherTables = tables.filter(t => !knownTables.includes(t) && !t.startsWith('_'));
    if (otherTables.length > 0) {
      console.log(`     其他: ${otherTables.join(', ')}`);
    }
  }
  
  console.log('');
}

// ============================================
// 必需表检查
// ============================================

const REQUIRED_TABLES = [
  // 核心表
  'stocks',
  'users',
  'user_sessions',
  
  // 分析报告
  'analysis_reports',
  'comic_reports',
  
  // 财务数据
  'income_statements',
  'balance_sheets',
  'cash_flows',
  'fina_indicators',
  'daily_quotes',
  'data_sync_logs',
  
  // 用户功能
  'user_favorites',
  'favorite_groups',
  'saved_questions',
  'user_preferences',
  
  // 会员系统
  'membership_plans',
  'membership_orders',
  'feature_limits',
  
  // 模型评估
  'model_configs',
  'model_evaluations',
  
  // Agent系统
  'user_agent_presets',
  'user_agent_settings',
];

function checkRequiredTables(prod = false) {
  const tables = getTableList(prod);
  const missing = REQUIRED_TABLES.filter(t => !tables.includes(t));
  
  if (missing.length > 0) {
    log(`缺少必需的表: ${missing.join(', ')}`, 'warn');
    return false;
  }
  
  log('所有必需的表都已存在', 'success');
  return true;
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('\n' + colors.bold('🗄️  Finspark 数据库初始化工具 v3.1 (A股+港股版)') + '\n');
  
  const args = process.argv.slice(2);
  const fullInit = args.includes('--full');
  const reset = args.includes('--reset');
  const migrateOnly = args.includes('--migrate-only');
  const seedOnly = args.includes('--seed-only');
  const sync = args.includes('--sync');
  const syncAll = args.includes('--sync-all');  // 全量A股+港股同步 (8100+)
  const syncHK = args.includes('--sync-hk');   // 仅港股同步
  const skipSync = args.includes('--skip-sync'); // 跳过同步，仅使用种子数据
  const prod = args.includes('--prod');
  const verbose = args.includes('--verbose');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log(`
使用方法:
  node scripts/db-init.mjs [options]

选项:
  --full          完整初始化（迁移+种子数据+验证）
  --reset         重置数据库（危险：会删除所有数据）
  --migrate-only  仅执行数据库迁移
  --seed-only     仅导入种子数据
  --sync          包含增量股票同步
  --sync-all      全量A股+港股同步（从 Tushare 获取 8100+ 股票）★推荐
  --sync-hk       仅同步港股数据（2700+ 只）
  --skip-sync     跳过同步，仅使用种子数据（169只）
  --prod          操作生产环境（默认本地）
  --verbose       显示详细日志
  --help, -h      显示此帮助信息

示例:
  # 首次初始化 + 全量A股+港股同步（推荐，约8100+股票）
  node scripts/db-init.mjs --full --sync-all

  # 仅同步港股数据
  node scripts/db-init.mjs --sync-hk

  # 快速初始化（仅种子数据，169只股票）
  node scripts/db-init.mjs --full --skip-sync

  # 仅执行迁移
  node scripts/db-init.mjs --migrate-only

  # 生产环境全量同步
  node scripts/db-init.mjs --full --sync-all --prod
`);
    return;
  }
  
  log(`配置: 环境=${prod ? '生产' : '本地'}, 完整=${fullInit}, 重置=${reset}, 全量同步=${syncAll}, 港股同步=${syncHK}, 跳过同步=${skipSync}`);
  console.log('');
  
  // 检查当前状态
  const d1State = checkD1State(prod);
  const stockCount = getStockCount(prod);
  
  log(`当前状态: D1=${d1State.initialized ? '已初始化' : '未初始化'}, 股票=${stockCount >= 0 ? stockCount : '未知'}`);
  console.log('');
  
  // 重置数据库
  if (reset) {
    if (!resetDatabase(prod, verbose)) {
      log('数据库重置失败', 'error');
      process.exit(1);
    }
    console.log('');
  }
  
  // 执行迁移
  if (fullInit || migrateOnly || stockCount < 0) {
    if (!runMigrations(prod, verbose)) {
      log('迁移失败', 'error');
      process.exit(1);
    }
    console.log('');
  }
  
  // 导入种子数据
  if (fullInit || seedOnly || stockCount === 0) {
    importSeedData(prod, verbose);
    console.log('');
  }
  
  // 全量同步
  if (syncAll) {
    // 全量A股+港股同步 (8100+)
    await syncAllStocks(prod, verbose, 'all');  // 'all' = A股+港股
    console.log('');
  } else if (syncHK) {
    // 仅港股同步
    await syncAllStocks(prod, verbose, 'hk');
    console.log('');
  } else if (sync) {
    // 增量同步（仅A股）
    await syncAllStocks(prod, verbose, 'a');
    console.log('');
  }
  
  // 检查必需表
  checkRequiredTables(prod);
  
  // 打印最终状态
  printStatus(prod);
  
  // 成功提示
  const finalCount = getStockCount(prod);
  
  console.log(colors.bold('✅ 数据库初始化完成'));
  console.log('');
  console.log(`   股票数据: ${finalCount >= 0 ? finalCount : '未知'} 只`);
  console.log('');
  
  if (!prod) {
    console.log(colors.dim('提示: 使用以下命令启动开发服务器:'));
    console.log(colors.dim('  npm run dev'));
    console.log('');
  }
}

// 运行
main().catch((error) => {
  log(`初始化失败: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});
