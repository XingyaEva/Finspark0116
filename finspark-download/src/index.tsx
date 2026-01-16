import { Hono } from 'hono';
import { cors } from 'hono/cors';
import api from './routes/api';
import auth from './routes/auth';
import user from './routes/user';
import favorites from './routes/favorites';
import reports from './routes/reports';
import characters from './routes/characters';
import themes from './routes/themes';
import assistant from './routes/assistant';
import modelTest from './routes/modelTest';
import dataSync from './routes/dataSync';
import membership from './routes/membership';
import preferences from './routes/preferences';
import agentPresets from './routes/agentPresets';
import { assistantPageHtml } from './pages/assistant';
import { assistantWidgetHtml } from './pages/assistantWidget';
import { membershipPageHtml } from './pages/membership';
import { settingsPageHtml } from './pages/settings';
import { agentSettingsPageHtml } from './pages/agentSettings';
import { floatingAssistantStyles, floatingAssistantHtml, floatingAssistantScript } from './components/floatingAssistant';
import { analysisConfigStyles, analysisConfigHtml, analysisConfigScript } from './components/analysisConfig';
import { stockMarketPanelStyles, stockMarketPanelHtml, stockMarketPanelScript } from './components/stockMarketPanel';
import { responsiveStyles } from './styles/responsive';
import { testChartPageHtml } from './pages/testChart';
import type { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>();

// 全局CORS
app.use('/*', cors());

// 测试页面 - ECharts & API 诊断
app.get('/test-chart.html', (c) => {
  return c.html(testChartPageHtml);
});

// API路由
app.route('/api', api);
app.route('/api/auth', auth);
app.route('/api/user', user);
app.route('/api/favorites', favorites);
app.route('/api/reports', reports);
app.route('/api/characters', characters);
app.route('/api/themes', themes);
app.route('/api/assistant', assistant);
app.route('/api/model-test', modelTest);
app.route('/api/data-sync', dataSync);
app.route('/api/membership', membership);
app.route('/api/preferences', preferences);
app.route('/api/agent-presets', agentPresets);

// 智能问数助手页面 - 全屏模式
app.get('/assistant', (c) => {
  return c.html(assistantPageHtml);
});

// 智能问数助手 - 悬浮组件演示页面
app.get('/assistant-widget', (c) => {
  return c.html(assistantWidgetHtml);
});

// 会员中心页面
app.get('/membership', (c) => {
  return c.html(membershipPageHtml);
});

// 用户设置页面
app.get('/settings', (c) => {
  return c.html(settingsPageHtml);
});

// Agent 配置中心页面
app.get('/settings/agents', (c) => {
  return c.html(agentSettingsPageHtml);
});

// 分享预览页面
import { generateSharePageHtml } from './pages/share';

app.get('/share/:code', async (c) => {
  const shareCode = c.req.param('code');
  
  if (!shareCode || !c.env.DB || !c.env.CACHE) {
    return c.redirect('/');
  }
  
  try {
    // 获取分享链接信息
    const shareLink = await c.env.DB.prepare(`
      SELECT sl.*, ar.company_name, ar.company_code, ar.result_json, ar.created_at as report_date
      FROM share_links sl
      JOIN analysis_reports ar ON sl.report_id = ar.id
      WHERE sl.share_code = ? AND sl.is_active = 1
    `).bind(shareCode).first();
    
    if (!shareLink) {
      return c.redirect('/?error=share_not_found');
    }
    
    // 检查是否过期
    if (shareLink.expires_at && new Date(shareLink.expires_at as string) < new Date()) {
      return c.redirect('/?error=share_expired');
    }
    
    // 更新访问计数
    await c.env.DB.prepare(`
      UPDATE share_links 
      SET view_count = view_count + 1, last_viewed_at = datetime('now')
      WHERE share_code = ?
    `).bind(shareCode).run();
    
    // 解析报告数据获取摘要信息
    let score: number | undefined;
    let recommendation: string | undefined;
    let summary: string | undefined;
    
    if (shareLink.result_json) {
      try {
        const result = JSON.parse(shareLink.result_json as string);
        score = result.finalConclusion?.companyQuality?.score || result.finalConclusion?.summary?.score;
        recommendation = result.finalConclusion?.recommendation?.action;
        summary = result.finalConclusion?.recommendation?.summary || result.finalConclusion?.summary?.text;
      } catch {}
    }
    
    const baseUrl = new URL(c.req.url).origin;
    
    return c.html(generateSharePageHtml({
      shareCode,
      reportId: shareLink.report_id as number,
      companyName: shareLink.company_name as string,
      companyCode: shareLink.company_code as string,
      score,
      recommendation,
      reportDate: shareLink.report_date as string,
      summary,
      baseUrl
    }));
  } catch (error) {
    console.error('Share page error:', error);
    return c.redirect('/');
  }
});

// ============ 首页 ============
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Finspark 投资分析系统</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
        body { font-family: 'Noto Sans SC', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh; }
        .gold-text { color: #d4af37; }
        .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 50%, #d4af37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .search-input { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(212, 175, 55, 0.3); transition: all 0.3s ease; }
        .search-input:focus { border-color: #d4af37; box-shadow: 0 0 20px rgba(212, 175, 55, 0.3); outline: none; }
        .stock-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(212, 175, 55, 0.2); transition: all 0.3s ease; }
        .stock-card:hover { background: rgba(255, 255, 255, 0.08); border-color: #d4af37; transform: translateY(-2px); }
        .btn-gold { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 100%); color: #0a0a0a; font-weight: 600; transition: all 0.3s ease; }
        .btn-gold:hover { transform: scale(1.02); box-shadow: 0 5px 20px rgba(212, 175, 55, 0.4); }
        .btn-outline { border: 1px solid rgba(212, 175, 55, 0.5); color: #d4af37; transition: all 0.3s ease; }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.1); }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 10px 40px rgba(212, 175, 55, 0.2); }
        .loading-dot { animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        .search-results { background: rgba(26, 26, 46, 0.95); border: 1px solid rgba(212, 175, 55, 0.3); backdrop-filter: blur(10px); }
        /* 图表Tab样式 */
        .chart-tab { padding: 8px 16px; cursor: pointer; border-radius: 8px; transition: all 0.3s ease; font-size: 13px; }
        .chart-tab:hover { background: rgba(212, 175, 55, 0.1); }
        .chart-tab.active { background: rgba(212, 175, 55, 0.2); color: #d4af37; font-weight: 600; }
        .chart-container { height: 320px; width: 100%; }
        .period-select { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 4px 12px; border-radius: 6px; font-size: 12px; color: #9ca3af; cursor: pointer; }
        .period-select:hover { border-color: rgba(212, 175, 55, 0.5); }
        .chart-legend { display: flex; align-items: center; gap: 16px; font-size: 12px; color: #9ca3af; }
        .chart-legend-item { display: flex; align-items: center; gap: 4px; }
        .chart-legend-dot { width: 10px; height: 10px; border-radius: 2px; }
        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 100; }
        .modal.active { display: flex; align-items: center; justify-content: center; }
        .modal-content { background: linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%); border: 1px solid rgba(212, 175, 55, 0.3); }
        .input-field { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; }
        .input-field:focus { border-color: #d4af37; outline: none; }
        .user-menu { position: relative; }
        .dropdown { display: none; position: absolute; top: 100%; right: 0; background: #1a1a2e; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; min-width: 200px; z-index: 100; }
        .dropdown.active { display: block; }
        
        /* 功能锁定样式 */
        .feature-locked { position: relative; opacity: 0.6; pointer-events: none; }
        .feature-locked::after { 
            content: '🔒'; 
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            font-size: 24px; 
            z-index: 10; 
        }
        .feature-lock-badge {
            position: absolute;
            top: -8px;
            right: -8px;
            background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);
            color: white;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: bold;
            z-index: 10;
        }
        .pro-feature { position: relative; }
        .pro-feature .feature-lock-badge { display: none; }
        .pro-feature.locked .feature-lock-badge { display: block; }
        .pro-feature.locked { cursor: pointer; }
        .pro-feature.locked:hover { opacity: 0.8; }
        ${floatingAssistantStyles}
        ${analysisConfigStyles}
        ` + stockMarketPanelStyles + `
        ${responsiveStyles}
    </style>
</head>
<body class="text-white">
    <!-- 桌面端导航栏 -->
    <nav class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800 hide-on-mobile">
        <div class="container-adaptive py-4 flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <i class="fas fa-chart-line text-2xl gold-text"></i>
                <span class="text-xl font-bold gold-gradient">Finspark 投资分析</span>
            </div>
            <div class="flex items-center space-x-6">
                <a href="/" class="text-gray-400 hover:text-white transition">首页</a>
                <a href="/my-reports" class="text-gray-400 hover:text-white transition">我的报告</a>
                <a href="/favorites" class="text-gray-400 hover:text-white transition">我的收藏</a>
                
                <!-- 未登录状态 -->
                <div id="authButtons" class="flex items-center space-x-3">
                    <button onclick="showModal('loginModal')" class="btn-outline px-4 py-2 rounded-lg">登录</button>
                    <button onclick="showModal('registerModal')" class="btn-gold px-4 py-2 rounded-lg">注册</button>
                </div>
                
                <!-- 已登录状态 -->
                <div id="userMenu" class="user-menu hidden">
                    <button onclick="toggleDropdown()" class="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700">
                        <i class="fas fa-user-circle gold-text"></i>
                        <span id="userName" class="text-sm"></span>
                        <span id="tierBadge" class="text-xs px-2 py-0.5 rounded bg-blue-600">免费</span>
                        <i class="fas fa-chevron-down text-xs text-gray-400"></i>
                    </button>
                    <div id="userDropdown" class="dropdown mt-2 py-2">
                        <div class="px-4 py-2 border-b border-gray-700 mb-2">
                            <div class="flex justify-between items-center mb-1">
                                <div class="text-xs text-gray-500">今日分析次数</div>
                                <div class="text-sm gold-text font-medium" id="quotaDisplay">--</div>
                            </div>
                            <div class="w-full bg-gray-700 rounded-full h-1.5 mb-2" id="quotaProgressContainer">
                                <div id="quotaProgress" class="h-1.5 rounded-full transition-all duration-300" style="width: 0%; background: linear-gradient(90deg, #d4af37, #f7e7a5);"></div>
                            </div>
                            <div id="quotaUpgradeHint" class="hidden text-xs text-yellow-500/80 flex items-center gap-1 cursor-pointer hover:text-yellow-400" onclick="showModal('upgradeModal')">
                                <i class="fas fa-arrow-circle-up"></i>
                                <span>升级获取更多次数</span>
                            </div>
                        </div>
                        <a href="/my-reports" class="block px-4 py-2 hover:bg-gray-800 text-sm"><i class="fas fa-file-alt mr-2 gold-text"></i>我的分析</a>
                        <a href="/favorites" class="block px-4 py-2 hover:bg-gray-800 text-sm"><i class="fas fa-heart mr-2 gold-text"></i>我的收藏</a>
                        <a href="/settings/agents" class="block px-4 py-2 hover:bg-gray-800 text-sm"><i class="fas fa-robot mr-2 gold-text"></i>Agent 配置</a>
                        <a href="/settings" class="block px-4 py-2 hover:bg-gray-800 text-sm"><i class="fas fa-cog mr-2 gold-text"></i>账号设置</a>
                        <hr class="border-gray-700 my-2">
                        <button onclick="logout()" class="w-full text-left px-4 py-2 hover:bg-gray-800 text-sm text-red-400"><i class="fas fa-sign-out-alt mr-2"></i>退出登录</button>
                    </div>
                </div>
            </div>
        </div>
    </nav>
    
    <!-- 移动端导航栏 -->
    <nav class="mobile-nav show-on-mobile">
        <div class="px-4 py-3 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-2">
                <i class="fas fa-chart-line text-xl gold-text"></i>
                <span class="text-lg font-bold gold-gradient">Finspark</span>
            </a>
            <button onclick="toggleMobileMenu()" class="p-2 text-gray-400 hover:text-white touch-target" aria-label="打开菜单">
                <i class="fas fa-bars text-xl"></i>
            </button>
        </div>
    </nav>
    
    <!-- 移动端菜单遮罩 -->
    <div id="mobileMenuOverlay" class="mobile-menu-overlay" onclick="closeMobileMenu()"></div>
    
    <!-- 移动端侧滑菜单 -->
    <div id="mobileMenuPanel" class="mobile-menu-panel">
        <div class="mobile-menu-header">
            <span class="font-bold gold-gradient">菜单</span>
            <button onclick="closeMobileMenu()" class="p-2 text-gray-400 hover:text-white touch-target" aria-label="关闭菜单">
                <i class="fas fa-times text-xl"></i>
            </button>
        </div>
        
        <!-- 移动端用户信息区域 -->
        <div id="mobileUserSection" class="px-5 py-4 border-b border-gray-800">
            <!-- 未登录状态 -->
            <div id="mobileAuthButtons" class="space-y-3">
                <button onclick="showModal('loginModal'); closeMobileMenu();" class="w-full btn-outline py-3 rounded-lg touch-target">登录</button>
                <button onclick="showModal('registerModal'); closeMobileMenu();" class="w-full btn-gold py-3 rounded-lg touch-target">注册</button>
            </div>
            <!-- 已登录状态 -->
            <div id="mobileUserInfo" class="hidden">
                <div class="flex items-center space-x-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <i class="fas fa-user-circle gold-text text-xl"></i>
                    </div>
                    <div>
                        <div id="mobileUserName" class="font-medium text-sm"></div>
                        <span id="mobileTierBadge" class="text-xs px-2 py-0.5 rounded bg-blue-600">免费</span>
                    </div>
                </div>
                <div class="text-xs text-gray-500">
                    今日分析：<span id="mobileQuotaDisplay" class="gold-text">--</span>
                </div>
            </div>
        </div>
        
        <!-- 移动端导航链接 -->
        <div class="mobile-menu-section-title">导航</div>
        <a href="/" class="mobile-menu-item" onclick="closeMobileMenu()">
            <i class="fas fa-home"></i>
            <span>首页</span>
        </a>
        <a href="/my-reports" class="mobile-menu-item" onclick="closeMobileMenu()">
            <i class="fas fa-file-alt"></i>
            <span>我的报告</span>
        </a>
        <a href="/favorites" class="mobile-menu-item" onclick="closeMobileMenu()">
            <i class="fas fa-heart"></i>
            <span>我的收藏</span>
        </a>
        
        <div class="mobile-menu-divider"></div>
        <div class="mobile-menu-section-title">设置</div>
        <a href="/settings/agents" class="mobile-menu-item" onclick="closeMobileMenu()">
            <i class="fas fa-robot"></i>
            <span>Agent 配置</span>
        </a>
        <a href="/settings" class="mobile-menu-item" onclick="closeMobileMenu()">
            <i class="fas fa-cog"></i>
            <span>账号设置</span>
        </a>
        <a href="/membership" class="mobile-menu-item" onclick="closeMobileMenu()">
            <i class="fas fa-crown"></i>
            <span>会员中心</span>
        </a>
        
        <!-- 已登录时显示退出按钮 -->
        <div id="mobileLogoutSection" class="hidden">
            <div class="mobile-menu-divider"></div>
            <button onclick="logout(); closeMobileMenu();" class="mobile-menu-item w-full text-left text-red-400">
                <i class="fas fa-sign-out-alt" style="color: #f87171;"></i>
                <span>退出登录</span>
            </button>
        </div>
    </div>

    <!-- 登录弹窗 -->
    <div id="loginModal" class="modal">
        <div class="modal-content rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold gold-gradient">登录</h3>
                <button onclick="hideModal('loginModal')" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
            <form id="loginForm" onsubmit="handleLogin(event)">
                <div class="mb-4">
                    <label class="block text-sm text-gray-400 mb-2">邮箱</label>
                    <input type="email" name="email" required class="input-field w-full px-4 py-3 rounded-lg" placeholder="请输入邮箱">
                </div>
                <div class="mb-6">
                    <label class="block text-sm text-gray-400 mb-2">密码</label>
                    <input type="password" name="password" required class="input-field w-full px-4 py-3 rounded-lg" placeholder="请输入密码">
                </div>
                <button type="submit" class="btn-gold w-full py-3 rounded-lg">登录</button>
                <p class="text-center text-gray-400 text-sm mt-4">还没有账号？<a href="#" onclick="switchModal('loginModal','registerModal')" class="gold-text">立即注册</a></p>
            </form>
            <div id="loginError" class="hidden mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm"></div>
        </div>
    </div>

    <!-- 注册弹窗 -->
    <div id="registerModal" class="modal">
        <div class="modal-content rounded-xl p-8 max-w-md w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold gold-gradient">注册</h3>
                <button onclick="hideModal('registerModal')" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
            <form id="registerForm" onsubmit="handleRegister(event)">
                <div class="mb-4">
                    <label class="block text-sm text-gray-400 mb-2">用户名</label>
                    <input type="text" name="name" required class="input-field w-full px-4 py-3 rounded-lg" placeholder="请输入用户名">
                </div>
                <div class="mb-4">
                    <label class="block text-sm text-gray-400 mb-2">邮箱</label>
                    <input type="email" name="email" required class="input-field w-full px-4 py-3 rounded-lg" placeholder="请输入邮箱">
                </div>
                <div class="mb-6">
                    <label class="block text-sm text-gray-400 mb-2">密码</label>
                    <input type="password" name="password" required minlength="6" class="input-field w-full px-4 py-3 rounded-lg" placeholder="至少6位密码">
                </div>
                <button type="submit" class="btn-gold w-full py-3 rounded-lg">注册</button>
                <p class="text-center text-gray-400 text-sm mt-4">已有账号？<a href="#" onclick="switchModal('registerModal','loginModal')" class="gold-text">立即登录</a></p>
            </form>
            <div id="registerError" class="hidden mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm"></div>
        </div>
    </div>

    <!-- 升级弹窗 -->
    <div id="upgradeModal" class="modal">
        <div class="modal-content rounded-xl p-8 max-w-lg w-full mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold gold-gradient">升级会员</h3>
                <button onclick="hideModal('upgradeModal')" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
            <div class="space-y-4">
                <div class="p-4 rounded-lg bg-gray-800 border border-gray-700">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-medium text-blue-400">Pro 会员</span>
                        <span class="text-gray-400">¥29/月</span>
                    </div>
                    <ul class="text-sm text-gray-400 space-y-1">
                        <li><i class="fas fa-check text-green-500 mr-2"></i>每日50次分析</li>
                        <li><i class="fas fa-check text-green-500 mr-2"></i>收藏上限500个</li>
                        <li><i class="fas fa-check text-green-500 mr-2"></i>完整功能访问</li>
                    </ul>
                </div>
                <div class="p-4 rounded-lg bg-gradient-to-r from-yellow-900/30 to-yellow-800/30 border border-yellow-600/50">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-medium gold-text">Elite 会员</span>
                        <span class="text-gray-400">¥99/月</span>
                    </div>
                    <ul class="text-sm text-gray-400 space-y-1">
                        <li><i class="fas fa-check text-green-500 mr-2"></i>无限分析次数</li>
                        <li><i class="fas fa-check text-green-500 mr-2"></i>收藏上限1000个</li>
                        <li><i class="fas fa-check text-green-500 mr-2"></i>PDF无水印导出</li>
                        <li><i class="fas fa-check text-green-500 mr-2"></i>优先客服支持</li>
                    </ul>
                </div>
                <p class="text-xs text-gray-500 text-center pt-2">会员功能正在开发中，敬请期待</p>
            </div>
        </div>
    </div>
    
    <!-- 历史对比弹窗 -->
    <div id="compareModal" class="modal">
        <div class="modal-content rounded-xl p-6 max-w-2xl w-full mx-4" style="max-height: 85vh; overflow-y: auto;">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold gold-gradient"><i class="fas fa-exchange-alt mr-2"></i>历史报告对比</h3>
                <button onclick="hideModal('compareModal')" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
            
            <!-- 选择对比报告 -->
            <div id="compareSelectSection">
                <p class="text-gray-400 text-sm mb-4">选择一份历史报告与当前分析进行对比：</p>
                <div id="compareOptions" class="space-y-2 mb-4">
                    <div class="text-center py-8 text-gray-500">
                        <i class="fas fa-spinner fa-spin mr-2"></i>加载中...
                    </div>
                </div>
            </div>
            
            <!-- 对比结果 -->
            <div id="compareResultSection" class="hidden">
                <button onclick="backToCompareSelect()" class="text-sm text-purple-400 hover:text-purple-300 mb-4">
                    <i class="fas fa-arrow-left mr-1"></i>返回选择
                </button>
                
                <!-- 对比摘要 -->
                <div id="compareSummary" class="card rounded-lg p-4 mb-4">
                    <div class="flex items-center gap-3 mb-3">
                        <div id="trendIcon" class="w-12 h-12 rounded-full flex items-center justify-center text-2xl"></div>
                        <div>
                            <div id="trendText" class="text-lg font-semibold"></div>
                            <div id="trendDesc" class="text-sm text-gray-400"></div>
                        </div>
                    </div>
                    <div id="highlightsAndConcerns" class="grid grid-cols-2 gap-4 mt-4"></div>
                </div>
                
                <!-- 指标变化详情 -->
                <div class="card rounded-lg p-4">
                    <h4 class="font-semibold text-white mb-3"><i class="fas fa-chart-bar mr-2 text-purple-400"></i>关键指标变化</h4>
                    <div id="metricsChanges" class="space-y-3"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 主内容区 -->
    <main class="pt-adaptive-header pb-8 md:pb-16">
        <div class="container-adaptive">
            <!-- Hero区域 -->
            <div class="text-center mb-8 md:mb-12">
                <h1 class="text-adaptive-hero font-bold mb-3 md:mb-4">
                    <span class="gold-gradient">AI驱动的</span>
                    <span class="text-white">智能财报分析</span>
                </h1>
                <p class="text-gray-400 text-base md:text-lg search-container-adaptive mx-auto">
                    多Agent协同分析，深度解读企业财务健康状况，为您提供专业的投资决策支持
                </p>
            </div>

            <!-- 搜索框 -->
            <div class="relative search-container-adaptive mx-auto mb-8 md:mb-16">
                <div class="relative">
                    <i class="fas fa-search absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-gray-500"></i>
                    <input type="text" id="searchInput" class="search-input w-full py-3 md:py-4 pl-12 md:pl-14 pr-16 md:pr-32 rounded-xl text-white text-base md:text-lg" placeholder="输入股票代码或名称...">
                    <button id="searchBtn" class="btn-gold absolute right-2 top-1/2 -translate-y-1/2 px-3 md:px-6 py-2 rounded-lg touch-target">
                        <i class="fas fa-rocket md:mr-2"></i><span class="hidden md:inline">开始分析</span>
                    </button>
                </div>
                <div id="searchResults" class="hidden absolute w-full mt-2 rounded-xl overflow-hidden search-results z-50"></div>
                
                ${analysisConfigHtml}
            </div>

            <!-- 热门股票 -->
            <div class="mb-8 md:mb-16">
                <h2 class="text-lg md:text-xl font-semibold mb-4 md:mb-6 flex items-center">
                    <i class="fas fa-fire gold-text mr-2 md:mr-3"></i>
                    <span class="gold-gradient">热门企业</span>
                </h2>
                <div id="hotStocks" class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                    <div class="stock-card rounded-xl p-4 text-center"><div class="loading-dot">加载中...</div></div>
                </div>
            </div>

            <!-- 功能特点 -->
            <div class="grid-adaptive-3 gap-4 md:gap-6">
                <div class="stock-card card-hover rounded-xl p-6">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-center mb-4">
                        <i class="fas fa-brain text-white text-xl"></i>
                    </div>
                    <h3 class="text-lg font-semibold mb-2 gold-text">10大Agent协同</h3>
                    <p class="text-gray-400 text-sm">利润表、资产负债表、现金流、三表联动等多维度智能分析</p>
                </div>
                <div class="stock-card card-hover rounded-xl p-6">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-center mb-4">
                        <i class="fas fa-chart-bar text-white text-xl"></i>
                    </div>
                    <h3 class="text-lg font-semibold mb-2 gold-text">实时数据分析</h3>
                    <p class="text-gray-400 text-sm">接入Tushare数据源，获取最新财务报表和市场数据</p>
                </div>
                <div class="stock-card card-hover rounded-xl p-6">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-center mb-4">
                        <i class="fas fa-palette text-white text-xl"></i>
                    </div>
                    <h3 class="text-lg font-semibold mb-2 gold-text">AI漫画解读</h3>
                    <p class="text-gray-400 text-sm">将复杂财报转化为生动有趣的漫画，让分析更易懂</p>
                </div>
            </div>
        </div>
    </main>

    <footer class="border-t border-gray-800 py-6 md:py-8">
        <div class="container-adaptive text-center text-gray-500 text-sm">
            <p>© 2024 Finspark 投资分析系统 | Powered by VectorEngine AI</p>
        </div>
    </footer>

    <script>
        // 全局状态
        let currentUser = null;
        let currentPermissions = null;
        let guestFingerprint = null;
        let selectedStock = null;
        let searchTimeout;
        
        // DOM 元素
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        const searchBtn = document.getElementById('searchBtn');
        const hotStocksContainer = document.getElementById('hotStocks');
        
        // ============ 访客会话 ID 生成（简化版） ============
        function generateGuestSessionId() {
            // 优先使用 crypto.randomUUID()（现代浏览器支持）
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            // 降级方案：手动生成 UUID v4
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        
        // 获取或创建访客会话 ID
        function getOrCreateGuestSessionId() {
            const storageKey = 'guestSessionId';
            let sessionId = localStorage.getItem(storageKey);
            
            if (!sessionId) {
                sessionId = generateGuestSessionId();
                localStorage.setItem(storageKey, sessionId);
            }
            
            return sessionId;
        }
        
        // 兼容旧代码：generateFingerprint 现在返回 Session ID
        async function generateFingerprint() {
            return getOrCreateGuestSessionId();
        }
        
        // ============ 认证状态管理 ============
        function getToken() { return localStorage.getItem('accessToken'); }
        function setTokens(access, refresh) {
            localStorage.setItem('accessToken', access);
            localStorage.setItem('refreshToken', refresh);
        }
        function clearTokens() {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            localStorage.removeItem('permissions');
        }
        function setPermissions(perms) {
            currentPermissions = perms;
            localStorage.setItem('permissions', JSON.stringify(perms));
        }
        function getPermissions() {
            if (currentPermissions) return currentPermissions;
            const stored = localStorage.getItem('permissions');
            return stored ? JSON.parse(stored) : null;
        }
        
        // 检查登录状态
        async function checkAuth() {
            // 初始化访客会话 ID（使用简化的 UUID 方案）
            if (!guestFingerprint) {
                // 优先使用新的 guestSessionId，向后兼容旧的 guestFingerprint
                guestFingerprint = localStorage.getItem('guestSessionId') || localStorage.getItem('guestFingerprint');
                if (!guestFingerprint) {
                    guestFingerprint = getOrCreateGuestSessionId();
                } else if (!localStorage.getItem('guestSessionId')) {
                    // 迁移旧数据到新 key
                    localStorage.setItem('guestSessionId', guestFingerprint);
                }
            }
            
            const token = getToken();
            if (!token) {
                // 初始化访客会话
                await initGuestSession();
                showGuestUI();
                return;
            }
            
            try {
                const response = await fetch('/api/auth/me', {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await response.json();
                
                if (data.success) {
                    currentUser = data.user;
                    setPermissions(data.permissions);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    showUserUI(data.user);
                } else {
                    clearTokens();
                    await initGuestSession();
                    showGuestUI();
                }
            } catch (error) {
                console.error('Auth check error:', error);
                await initGuestSession();
                showGuestUI();
            }
        }
        
        // 初始化访客会话
        async function initGuestSession() {
            try {
                const response = await fetch('/api/user/guest/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fingerprint: guestFingerprint })
                });
                const data = await response.json();
                if (data.success && data.permissions) {
                    setPermissions(data.permissions);
                }
            } catch (error) {
                console.error('Guest init error:', error);
            }
        }
        
        function showGuestUI() {
            document.getElementById('authButtons').classList.remove('hidden');
            document.getElementById('userMenu').classList.add('hidden');
            updateQuotaDisplay();
            updateMobileAuthUI(); // 同步移动端状态
        }
        
        function showUserUI(user) {
            document.getElementById('authButtons').classList.add('hidden');
            document.getElementById('userMenu').classList.remove('hidden');
            document.getElementById('userName').textContent = user.nickname || user.name || user.email;
            updateQuotaDisplay();
            updateTierBadge(user);
            updateMobileAuthUI(); // 同步移动端状态
        }
        
        // 更新配额显示
        function updateQuotaDisplay() {
            const perms = getPermissions();
            if (!perms) return;
            
            const quotaEl = document.getElementById('quotaDisplay');
            const progressEl = document.getElementById('quotaProgress');
            const progressContainer = document.getElementById('quotaProgressContainer');
            const upgradeHint = document.getElementById('quotaUpgradeHint');
            
            if (quotaEl) {
                if (perms.remainingAnalysis === null) {
                    quotaEl.textContent = '无限';
                    // Elite 无限额度，隐藏进度条
                    if (progressContainer) progressContainer.classList.add('hidden');
                    if (upgradeHint) upgradeHint.classList.add('hidden');
                } else {
                    quotaEl.textContent = \`\${perms.remainingAnalysis}/\${perms.maxDailyAnalysis}\`;
                    
                    // 显示进度条
                    if (progressContainer) progressContainer.classList.remove('hidden');
                    if (progressEl) {
                        const percentage = (perms.remainingAnalysis / perms.maxDailyAnalysis) * 100;
                        progressEl.style.width = percentage + '%';
                        
                        // 根据剩余次数设置进度条颜色
                        if (percentage <= 20) {
                            progressEl.style.background = 'linear-gradient(90deg, #ef4444, #f87171)'; // 红色
                        } else if (percentage <= 50) {
                            progressEl.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)'; // 橙色
                        } else {
                            progressEl.style.background = 'linear-gradient(90deg, #d4af37, #f7e7a5)'; // 金色
                        }
                    }
                    
                    // 剩余次数少于30%且不是Elite时显示升级提示
                    const percentage = (perms.remainingAnalysis / perms.maxDailyAnalysis) * 100;
                    if (upgradeHint) {
                        if (percentage <= 30 && perms.tier !== 'elite') {
                            upgradeHint.classList.remove('hidden');
                        } else {
                            upgradeHint.classList.add('hidden');
                        }
                    }
                }
            }
        }
        
        // 更新会员等级标识
        function updateTierBadge(user) {
            const tierBadge = document.getElementById('tierBadge');
            if (!tierBadge) return;
            
            const tierColors = {
                'guest': 'bg-gray-600',
                'free': 'bg-blue-600',
                'pro': 'bg-purple-600',
                'elite': 'bg-yellow-600'
            };
            const tierNames = {
                'guest': '访客',
                'free': '免费',
                'pro': 'Pro',
                'elite': 'Elite'
            };
            const tier = user.membership_tier || 'free';
            tierBadge.className = \`text-xs px-2 py-0.5 rounded \${tierColors[tier] || 'bg-gray-600'}\`;
            tierBadge.textContent = tierNames[tier] || '免费';
            
            // 更新功能锁定状态
            updateFeatureLockUI();
        }
        
        // 更新功能锁定UI状态
        function updateFeatureLockUI() {
            const perms = getPermissions();
            
            // 漫画按钮锁定
            const comicBtn = document.getElementById('generateComicBtn');
            if (comicBtn) {
                if (perms?.canViewAiComic) {
                    comicBtn.classList.remove('locked');
                } else {
                    comicBtn.classList.add('locked');
                }
            }
            
            // 可以在这里添加更多功能的锁定UI更新
        }
        
        // 检查功能权限
        function checkFeaturePermission(feature, showPrompt = true) {
            const perms = getPermissions();
            if (!perms) return false;
            
            const featureMap = {
                'ai_comic': perms.canViewAiComic,
                'risk_assessment': perms.canViewRiskAssessment,
                'industry_comparison': perms.canViewIndustryComparison,
                'pdf_export': perms.canExportPdf,
                'pdf_no_watermark': perms.canExportPdfWithoutWatermark,
                'favorite': perms.canFavorite,
                'history': perms.canViewHistory,
            };
            
            const hasPermission = featureMap[feature] ?? false;
            
            if (!hasPermission && showPrompt && perms.upgradePrompt) {
                showUpgradePrompt(perms.upgradePrompt, perms.tier === 'guest');
            }
            
            return hasPermission;
        }
        
        // 显示升级提示
        function showUpgradePrompt(message, needLogin = false) {
            const modalId = 'upgradeModal';
            let modal = document.getElementById(modalId);
            
            if (!modal) {
                modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'modal';
                modal.innerHTML = \`
                    <div class="modal-content rounded-xl p-8 max-w-md w-full mx-4 text-center">
                        <i class="fas fa-crown text-4xl gold-text mb-4"></i>
                        <h3 class="text-xl font-bold mb-4">解锁更多功能</h3>
                        <p id="upgradeMessage" class="text-gray-400 mb-6"></p>
                        <div class="flex space-x-3 justify-center">
                            <button onclick="hideModal('upgradeModal')" class="btn-outline px-6 py-2 rounded-lg">稍后再说</button>
                            <button id="upgradeAction" class="btn-gold px-6 py-2 rounded-lg"></button>
                        </div>
                    </div>
                \`;
                document.body.appendChild(modal);
            }
            
            document.getElementById('upgradeMessage').textContent = message;
            const actionBtn = document.getElementById('upgradeAction');
            
            if (needLogin) {
                actionBtn.textContent = '立即登录';
                actionBtn.onclick = () => { hideModal('upgradeModal'); showModal('loginModal'); };
            } else {
                actionBtn.textContent = '了解会员';
                actionBtn.onclick = () => { hideModal('upgradeModal'); window.location.href = '/membership'; };
            }
            
            showModal(modalId);
        }
        
        // 弹窗控制
        function showModal(id) { document.getElementById(id)?.classList.add('active'); }
        function hideModal(id) {
            document.getElementById(id).classList.remove('active');
            document.getElementById(id.replace('Modal', 'Error'))?.classList.add('hidden');
        }
        function switchModal(from, to) { hideModal(from); showModal(to); }
        function toggleDropdown() { document.getElementById('userDropdown').classList.toggle('active'); }
        
        // 移动端菜单控制
        function toggleMobileMenu() {
            document.getElementById('mobileMenuOverlay')?.classList.add('open');
            document.getElementById('mobileMenuPanel')?.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        
        function closeMobileMenu() {
            document.getElementById('mobileMenuOverlay')?.classList.remove('open');
            document.getElementById('mobileMenuPanel')?.classList.remove('open');
            document.body.style.overflow = '';
        }
        
        // 更新移动端用户信息
        function updateMobileAuthUI() {
            const mobileAuthButtons = document.getElementById('mobileAuthButtons');
            const mobileUserInfo = document.getElementById('mobileUserInfo');
            const mobileLogoutSection = document.getElementById('mobileLogoutSection');
            
            if (!mobileAuthButtons || !mobileUserInfo) return;
            
            if (currentUser) {
                mobileAuthButtons.classList.add('hidden');
                mobileUserInfo.classList.remove('hidden');
                mobileLogoutSection?.classList.remove('hidden');
                
                const mobileUserName = document.getElementById('mobileUserName');
                const mobileTierBadge = document.getElementById('mobileTierBadge');
                const mobileQuotaDisplay = document.getElementById('mobileQuotaDisplay');
                
                if (mobileUserName) mobileUserName.textContent = currentUser.name || currentUser.email;
                if (mobileTierBadge) {
                    const tierMap = { free: '免费', pro: 'Pro', elite: 'Elite' };
                    const colorMap = { free: 'bg-blue-600', pro: 'bg-purple-600', elite: 'bg-gradient-to-r from-yellow-500 to-yellow-600' };
                    mobileTierBadge.textContent = tierMap[currentUser.membership_tier] || '免费';
                    mobileTierBadge.className = 'text-xs px-2 py-0.5 rounded ' + (colorMap[currentUser.membership_tier] || 'bg-blue-600');
                }
                if (mobileQuotaDisplay && document.getElementById('quotaDisplay')) {
                    mobileQuotaDisplay.textContent = document.getElementById('quotaDisplay').textContent;
                }
            } else {
                mobileAuthButtons.classList.remove('hidden');
                mobileUserInfo.classList.add('hidden');
                mobileLogoutSection?.classList.add('hidden');
            }
        }
        
        // 登录
        async function handleLogin(e) {
            e.preventDefault();
            const form = e.target;
            const errorEl = document.getElementById('loginError');
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: form.email.value,
                        password: form.password.value,
                        guestFingerprint: guestFingerprint
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    setTokens(data.accessToken, data.refreshToken);
                    currentUser = data.user;
                    if (data.user.permissions) {
                        setPermissions(data.user.permissions);
                    }
                    localStorage.setItem('user', JSON.stringify(data.user));
                    hideModal('loginModal');
                    showUserUI(data.user);
                    form.reset();
                    
                    // 显示迁移结果提示
                    if (data.migration && data.migration.success && data.migration.migratedReports > 0) {
                        showMigrationToast(data.migration);
                    }
                } else {
                    errorEl.textContent = data.error || '登录失败';
                    errorEl.classList.remove('hidden');
                }
            } catch (error) {
                errorEl.textContent = '网络错误，请重试';
                errorEl.classList.remove('hidden');
            }
        }
        
        // 注册
        async function handleRegister(e) {
            e.preventDefault();
            const form = e.target;
            const errorEl = document.getElementById('registerError');
            
            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: form.name.value,
                        email: form.email.value,
                        password: form.password.value,
                        guestFingerprint: guestFingerprint
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    setTokens(data.accessToken, data.refreshToken);
                    currentUser = data.user;
                    if (data.user.permissions) {
                        setPermissions(data.user.permissions);
                    }
                    localStorage.setItem('user', JSON.stringify(data.user));
                    hideModal('registerModal');
                    showUserUI(data.user);
                    form.reset();
                    
                    // 显示迁移结果提示
                    if (data.migration && data.migration.success && data.migration.migratedReports > 0) {
                        showMigrationToast(data.migration);
                    }
                } else {
                    errorEl.textContent = data.error || '注册失败';
                    errorEl.classList.remove('hidden');
                }
            } catch (error) {
                errorEl.textContent = '网络错误，请重试';
                errorEl.classList.remove('hidden');
            }
        }
        
        // 退出
        async function logout() {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
                fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                }).catch(() => {});
            }
            clearTokens();
            currentUser = null;
            currentPermissions = null;
            // 重新初始化访客会话
            await initGuestSession();
            showGuestUI();
            document.getElementById('userDropdown').classList.remove('active');
        }
        
        // 显示迁移成功提示
        function showMigrationToast(migration) {
            const toast = document.createElement('div');
            toast.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-slide-in';
            toast.innerHTML = \`
                <div class="flex-shrink-0">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <div>
                    <div class="font-medium">数据迁移成功</div>
                    <div class="text-sm opacity-90">\${migration.message}</div>
                </div>
                <button class="ml-4 text-white/80 hover:text-white" onclick="this.parentElement.remove()">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            \`;
            document.body.appendChild(toast);
            
            // 5秒后自动消失
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }
        
        // 点击外部关闭下拉
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                document.getElementById('userDropdown')?.classList.remove('active');
            }
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('hidden');
            }
        });
        
        // 搜索缓存系统 - 减少重复API请求
        const searchCache = {
            hot: null,           // 热门股票缓存
            results: new Map(),  // 搜索结果缓存 (keyword -> results)
            maxSize: 50,         // 最大缓存条目数
            ttl: 5 * 60 * 1000,  // 缓存有效期5分钟
            timestamps: new Map(), // 缓存时间戳
            
            get(keyword) {
                const cached = this.results.get(keyword);
                const timestamp = this.timestamps.get(keyword);
                if (cached && timestamp && (Date.now() - timestamp < this.ttl)) {
                    return cached;
                }
                return null;
            },
            
            set(keyword, results) {
                // LRU淘汰
                if (this.results.size >= this.maxSize) {
                    const oldestKey = this.results.keys().next().value;
                    this.results.delete(oldestKey);
                    this.timestamps.delete(oldestKey);
                }
                this.results.set(keyword, results);
                this.timestamps.set(keyword, Date.now());
            }
        };
        
        // 热门股票
        async function loadHotStocks() {
            try {
                const response = await fetch('/api/stock/hot');
                const data = await response.json();
                if (data.success) {
                    // 同时更新缓存
                    searchCache.hot = data.data;
                    
                    hotStocksContainer.innerHTML = data.data.map(stock => \`
                        <div class="stock-card rounded-xl p-4 cursor-pointer" onclick="selectStock('\${stock.code}', '\${stock.name}')">
                            <div class="text-lg font-semibold gold-text">\${stock.name}</div>
                            <div class="text-sm text-gray-400">\${stock.code}</div>
                            <div class="text-xs text-gray-500 mt-1">\${stock.industry}</div>
                        </div>
                    \`).join('');
                }
            } catch (error) {
                console.error('Load hot stocks error:', error);
            }
        }
        
        // 搜索股票 - 高性能优化版本
        let searchAbortController = null;
        
        async function searchStocks(keyword) {
            keyword = keyword.trim();
            
            if (keyword.length < 1) {
                searchResults.classList.add('hidden');
                return;
            }
            
            // 取消之前的请求
            if (searchAbortController) {
                searchAbortController.abort();
            }
            searchAbortController = new AbortController();
            
            // 优先检查是否是股票代码格式（立即响应，无需API）
            const codeMatch = keyword.match(/^(\\d{6})(\\.S[HZ])?$/i);
            if (codeMatch) {
                const code = codeMatch[1];
                const suffix = code.startsWith('6') ? '.SH' : '.SZ';
                const fullCode = codeMatch[2] ? keyword.toUpperCase() : code + suffix;
                
                // 立即显示代码匹配结果
                searchResults.innerHTML = \`
                    <div class="p-4 hover:bg-white/10 cursor-pointer border-b border-gray-700" onclick="selectStock('\${fullCode}', '\${fullCode}')">
                        <div class="font-semibold gold-text"><i class="fas fa-check-circle mr-2 text-green-400"></i>\${fullCode}</div>
                        <div class="text-sm text-gray-400">点击直接使用此代码分析</div>
                    </div>
                \`;
                searchResults.classList.remove('hidden');
                
                // 异步尝试获取更多信息，但用户可以直接点击
                try {
                    const response = await fetch(\`/api/stock/search?q=\${encodeURIComponent(keyword)}\`, {
                        signal: searchAbortController.signal
                    });
                    const data = await response.json();
                    if (data.success && data.results.length > 0) {
                        renderSearchResults(data.results);
                        searchCache.set(keyword, data.results);
                    }
                } catch (e) { /* 静默失败，用户已有可用选项 */ }
                return;
            }
            
            // 检查缓存（即时响应）
            const cached = searchCache.get(keyword);
            if (cached) {
                renderSearchResults(cached);
                return;
            }
            
            // 显示简洁加载状态
            searchResults.innerHTML = '<div class="p-3 text-gray-400 text-center text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>搜索中...</div>';
            searchResults.classList.remove('hidden');
            
            try {
                const response = await fetch(\`/api/stock/search?q=\${encodeURIComponent(keyword)}\`, {
                    signal: searchAbortController.signal
                });
                const data = await response.json();
                
                if (data.success && data.results.length > 0) {
                    // 缓存结果
                    searchCache.set(keyword, data.results);
                    renderSearchResults(data.results);
                } else {
                    // 使用已缓存的热门股票推荐（不发起新请求）
                    if (searchCache.hot && searchCache.hot.length > 0) {
                        searchResults.innerHTML = \`
                            <div class="p-2 text-gray-500 text-xs border-b border-gray-700 bg-gray-800/50">
                                <i class="fas fa-info-circle mr-1"></i>未找到 "\${keyword}"，推荐热门：
                            </div>
                        \` + searchCache.hot.slice(0, 5).map(stock => \`
                            <div class="p-3 hover:bg-white/10 cursor-pointer flex items-center justify-between border-b border-gray-800/50" onclick="selectStock('\${stock.code}', '\${stock.name}')">
                                <div><div class="font-semibold">\${stock.name}</div><div class="text-sm text-gray-400">\${stock.code}</div></div>
                                <div class="text-xs text-gray-500">\${stock.industry || ''}</div>
                            </div>
                        \`).join('');
                    } else {
                        searchResults.innerHTML = \`
                            <div class="p-4 text-gray-400 text-center">
                                <p>暂无 "\${keyword}" 相关结果</p>
                                <p class="text-xs mt-2 text-gray-500">提示：可输入股票代码（如 600519）或公司名称</p>
                            </div>
                        \`;
                    }
                    searchResults.classList.remove('hidden');
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Search error:', error);
                }
            }
        }
        
        // 渲染搜索结果（提取为独立函数）
        function renderSearchResults(results) {
            searchResults.innerHTML = results.slice(0, 8).map(stock => \`
                <div class="p-3 hover:bg-white/10 cursor-pointer flex items-center justify-between border-b border-gray-800/50" onclick="selectStock('\${stock.code}', '\${stock.name}')">
                    <div><div class="font-semibold">\${stock.name}</div><div class="text-sm text-gray-400">\${stock.code}</div></div>
                    <div class="text-xs text-gray-500">\${stock.industry || ''}</div>
                </div>
            \`).join('');
            searchResults.classList.remove('hidden');
        }
        
        function selectStock(code, name) {
            selectedStock = { code, name };
            searchInput.value = name === code ? code : \`\${name} (\${code})\`;
            searchResults.classList.add('hidden');
        }
        
        function startAnalysis() {
            // 如果没有选择股票，检查输入框是否是有效的股票代码
            if (!selectedStock) {
                const input = searchInput.value.trim();
                const codeMatch = input.match(/^(\\d{6})(\\.S[HZ])?$/i);
                if (codeMatch) {
                    const code = codeMatch[1];
                    const suffix = code.startsWith('6') ? '.SH' : '.SZ';
                    const fullCode = codeMatch[2] ? input.toUpperCase() : code + suffix;
                    selectedStock = { code: fullCode, name: fullCode };
                } else {
                    alert('请选择一个股票或输入有效的6位股票代码（如 600519）');
                    return;
                }
            }
            
            // 获取分析配置参数
            let configParams = '';
            if (typeof getAnalysisPresetOverrides === 'function') {
                const overrides = getAnalysisPresetOverrides();
                if (overrides && overrides.globalPresetId) {
                    configParams = \`&presetId=\${overrides.globalPresetId}\`;
                }
                if (overrides && overrides.globalModelPreference) {
                    configParams += \`&model=\${overrides.globalModelPreference}\`;
                }
            }
            
            window.location.href = \`/analysis?code=\${selectedStock.code}&name=\${encodeURIComponent(selectedStock.name)}\${configParams}\`;
        }
        
        // 事件绑定 - 降低防抖延迟以加速响应
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            // 150ms防抖：平衡用户体验和API调用频率
            searchTimeout = setTimeout(() => searchStocks(e.target.value), 150);
        });
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) searchResults.classList.remove('hidden');
        });
        searchBtn.addEventListener('click', startAnalysis);
        searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') startAnalysis(); });
        
        ${analysisConfigScript}
        
        // 初始化
        checkAuth();
        loadHotStocks();
        loadAnalysisConfig();
    </script>
    
    <!-- 悬浮智能问数助手 -->
    ${floatingAssistantHtml}
    ${floatingAssistantScript}
</body>
</html>
  `);
});

// ============ 分析页面 ============
app.get('/analysis', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>投资分析 - Finspark</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
        body { font-family: 'Noto Sans SC', sans-serif; background: #0a0a0a; min-height: 100vh; }
        .gold-text { color: #d4af37; }
        .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 50%, #d4af37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(212, 175, 55, 0.2); }
        .progress-bar { background: linear-gradient(90deg, #d4af37 0%, #f5d17e 100%); }
        .agent-item.completed { border-color: #22c55e; }
        .agent-item.processing { border-color: #d4af37; animation: pulse 1.5s infinite; }
        /* 增强模块样式 */
        .enhanced-agent-item.waiting { border-color: #374151; }
        .enhanced-agent-item.loading { border-color: #f97316; animation: pulse 1.5s infinite; box-shadow: 0 0 20px rgba(249, 115, 22, 0.2); }
        .enhanced-agent-item.completed { border-color: #22c55e; box-shadow: 0 0 15px rgba(34, 197, 94, 0.15); }
        .enhanced-agent-item.error { border-color: #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .btn-gold { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 100%); color: #0a0a0a; font-weight: 600; }
        .btn-gold:hover { transform: scale(1.02); box-shadow: 0 5px 20px rgba(212, 175, 55, 0.4); }
        .btn-outline { border: 1px solid rgba(212, 175, 55, 0.5); color: #d4af37; }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.1); }
        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 100; }
        .modal.active { display: flex; align-items: center; justify-content: center; }
        .comic-panel { background: #1a1a2e; border: 2px solid #d4af37; border-radius: 12px; }
        /* 长图漫画样式 */
        .comic-long-card { max-width: 680px; margin: 0 auto; }
        .comic-long-panel { position: relative; }
        .comic-long-panel::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
        .comic-grid-panel { min-height: auto; }
        .comic-grid-card .comic-grid-panel:nth-child(odd) { border-right: 1px solid rgba(100, 100, 120, 0.3); }
        .comic-grid-card .comic-grid-panel:nth-child(-n+6) { border-bottom: 1px solid rgba(100, 100, 120, 0.3); }
        .comic-highlights { border-top: 1px solid rgba(212, 175, 55, 0.3); }
        .layout-option.selected { border-width: 2px; }
        .loading-spinner { border: 3px solid rgba(212, 175, 55, 0.2); border-top-color: #d4af37; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        /* 图表Tab样式 */
        .chart-tab { padding: 8px 16px; cursor: pointer; border-radius: 8px; transition: all 0.3s ease; font-size: 13px; }
        .chart-tab:hover { background: rgba(212, 175, 55, 0.1); }
        .chart-tab.active { background: rgba(212, 175, 55, 0.2); color: #d4af37; font-weight: 600; }
        .chart-container { height: 320px; width: 100%; }
        .period-select { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 4px 12px; border-radius: 6px; font-size: 12px; color: #9ca3af; cursor: pointer; }
        .period-select:hover { border-color: rgba(212, 175, 55, 0.5); }
        .chart-legend { display: flex; align-items: center; gap: 16px; font-size: 12px; color: #9ca3af; }
        .chart-legend-item { display: flex; align-items: center; gap: 4px; }
        .chart-legend-dot { width: 10px; height: 10px; border-radius: 2px; }
        /* 响应式图表高度 */
        @media (max-width: 767px) { .chart-container { height: 260px; } }
        ${floatingAssistantStyles}
        ${stockMarketPanelStyles}
        ${responsiveStyles}
    </style>
</head>
<body class="text-white">
    <!-- 桌面端导航栏 -->
    <nav class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800 hide-on-mobile">
        <div class="container-adaptive py-4 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-3">
                <i class="fas fa-chart-line text-2xl gold-text"></i>
                <span class="text-xl font-bold gold-gradient">Finspark 投资分析</span>
            </a>
            <div class="flex items-center space-x-4">
                <button id="shareBtn" onclick="createShareLink()" class="btn-outline px-4 py-2 rounded-lg hidden">
                    <i class="fas fa-share-alt mr-2"></i>分享
                </button>
                <button id="favoriteBtn" class="btn-outline px-4 py-2 rounded-lg hidden">
                    <i class="far fa-heart mr-2"></i>收藏
                </button>
            </div>
        </div>
    </nav>
    
    <!-- 移动端导航栏 -->
    <nav class="mobile-nav show-on-mobile">
        <div class="px-4 py-3 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-2">
                <i class="fas fa-arrow-left text-gray-400"></i>
                <span class="text-lg font-bold gold-gradient">Finspark</span>
            </a>
            <div class="flex items-center space-x-2">
                <button id="shareBtnMobile" onclick="createShareLink()" class="p-2 text-gray-400 hover:text-white touch-target hidden">
                    <i class="fas fa-share-alt text-lg"></i>
                </button>
                <button id="favoriteBtnMobile" class="p-2 text-gray-400 hover:text-white touch-target hidden">
                    <i class="far fa-heart text-lg"></i>
                </button>
            </div>
        </div>
    </nav>

    <main class="pt-adaptive-header pb-8 md:pb-16">
        <div class="container-adaptive">
            <!-- 公司信息头部 -->
            <div class="card rounded-xl p-4 md:p-6 mb-6 md:mb-8">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div>
                        <h1 id="companyName" class="text-2xl md:text-3xl font-bold gold-gradient">加载中...</h1>
                        <p id="companyCode" class="text-gray-400 mt-1 text-sm md:text-base"></p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 sm:gap-4">
                        <div id="analysisStatus" class="text-left sm:text-right">
                            <div class="text-xs sm:text-sm text-gray-400">分析状态</div>
                            <div class="text-base sm:text-lg gold-text font-semibold">准备中</div>
                        </div>
                        <button id="compareBtn" onclick="showCompareModal()" class="hidden px-3 sm:px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-purple-500/25 flex items-center gap-1 sm:gap-2 text-sm">
                            <i class="fas fa-exchange-alt"></i>
                            <span class="hidden sm:inline">历史对比</span>
                        </button>
                        <button id="reanalyzeBtn" onclick="forceReanalyze()" class="hidden px-3 sm:px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-orange-500/25 flex items-center gap-1 sm:gap-2 text-sm">
                            <i class="fas fa-sync-alt"></i>
                            <span class="hidden sm:inline">重新分析</span>
                        </button>
                    </div>
                </div>
                
                <!-- 进度条 -->
                <div class="mt-4 md:mt-6">
                    <div class="flex justify-between text-xs sm:text-sm text-gray-400 mb-2">
                        <span id="currentPhase">初始化</span>
                        <span id="progressPercent">0%</span>
                    </div>
                    <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div id="progressBar" class="progress-bar h-full rounded-full transition-all duration-500" style="width: 0%"></div>
                    </div>
                </div>
            </div>

            <!-- Agent执行状态 (A+D混合模式：5列紧凑，手机只显示图标) -->
            <div class="grid grid-cols-5 gap-1.5 sm:gap-3 mb-6 md:mb-8" id="agentStatus">
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="分析规划">
                    <i class="fas fa-clipboard-list gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">分析规划</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="利润表">
                    <i class="fas fa-chart-line gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">利润表</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="资产负债表">
                    <i class="fas fa-balance-scale gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">资产负债</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="现金流">
                    <i class="fas fa-money-bill-wave gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">现金流</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="三表联动">
                    <i class="fas fa-link gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">三表联动</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="风险评估">
                    <i class="fas fa-exclamation-triangle gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">风险评估</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="业务洞察">
                    <i class="fas fa-building gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">业务洞察</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="商业模式">
                    <i class="fas fa-lightbulb gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">商业模式</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="业绩预测">
                    <i class="fas fa-chart-bar gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">业绩预测</div>
                </div>
                <div class="agent-item card rounded-lg p-2 sm:p-3 text-center border-2 border-gray-700" title="投资结论">
                    <i class="fas fa-gavel gold-text text-sm sm:text-base mb-0 sm:mb-2"></i>
                    <div class="hidden sm:block text-xs text-gray-400">投资结论</div>
                </div>
            </div>

            <!-- 增强模块区块 - 独立于主编排的扩展分析 -->
            <div id="enhancedModulesSection" class="mb-8 hidden">
                <div class="flex items-center gap-3 mb-4">
                    <div class="flex-1 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent"></div>
                    <h3 class="text-sm font-semibold text-orange-400 flex items-center">
                        <i class="fas fa-puzzle-piece mr-2"></i>增强模块
                    </h3>
                    <div class="flex-1 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent"></div>
                </div>
                
                <!-- 增强模块Agent进度卡片 -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <!-- 行业对比Agent -->
                    <div id="industryComparisonAgentCard" class="enhanced-agent-item card rounded-lg p-4 border-2 border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800 transition-all duration-300">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-chart-bar text-orange-400 text-lg"></i>
                            <span id="industryComparisonAgentStatus" class="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">待执行</span>
                        </div>
                        <div class="text-sm font-semibold text-gray-200 mb-1">行业对比</div>
                        <div class="text-xs text-gray-500">Industry Comparison</div>
                        <div class="mt-2">
                            <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
                                <div id="industryComparisonAgentProgress" class="h-full bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full transition-all duration-500" style="width: 0%"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 预留: 舆情分析Agent (未来扩展) -->
                    <div class="enhanced-agent-item card rounded-lg p-4 border-2 border-dashed border-gray-700 bg-gray-900/30 opacity-50">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-comments text-gray-600 text-lg"></i>
                            <span class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-600">敬请期待</span>
                        </div>
                        <div class="text-sm font-semibold text-gray-500 mb-1">舆情分析</div>
                        <div class="text-xs text-gray-600">Sentiment Analysis</div>
                    </div>
                    
                    <!-- 预留: 竞品追踪Agent (未来扩展) -->
                    <div class="enhanced-agent-item card rounded-lg p-4 border-2 border-dashed border-gray-700 bg-gray-900/30 opacity-50">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-crosshairs text-gray-600 text-lg"></i>
                            <span class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-600">敬请期待</span>
                        </div>
                        <div class="text-sm font-semibold text-gray-500 mb-1">竞品追踪</div>
                        <div class="text-xs text-gray-600">Competitor Tracking</div>
                    </div>
                    
                    <!-- 预留: 政策解读Agent (未来扩展) -->
                    <div class="enhanced-agent-item card rounded-lg p-4 border-2 border-dashed border-gray-700 bg-gray-900/30 opacity-50">
                        <div class="flex items-center justify-between mb-2">
                            <i class="fas fa-landmark text-gray-600 text-lg"></i>
                            <span class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-600">敬请期待</span>
                        </div>
                        <div class="text-sm font-semibold text-gray-500 mb-1">政策解读</div>
                        <div class="text-xs text-gray-600">Policy Analysis</div>
                    </div>
                </div>
            </div>

            <!-- 分析结果区域 -->
            <div id="analysisResults" class="hidden">
                <!-- 操作按钮 -->
                <div id="actionButtons" class="flex gap-2 sm:gap-4 mb-4 md:mb-6 flex-wrap items-center">
                    <!-- PDF导出下拉按钮 -->
                    <div class="relative inline-block" id="pdfDropdown">
                        <button id="exportPdfBtn" class="btn-gold px-3 sm:px-6 py-2 sm:py-3 rounded-lg flex items-center text-sm sm:text-base">
                            <i class="fas fa-file-pdf sm:mr-2"></i><span class="hidden sm:inline">导出 PDF 报告</span>
                            <i class="fas fa-chevron-down ml-1 sm:ml-2 text-xs"></i>
                        </button>
                        <div id="pdfDropdownMenu" class="hidden absolute left-0 mt-2 w-64 rounded-lg shadow-xl bg-gray-800 border border-gray-600 z-50">
                            <div class="py-2">
                                <button id="exportPdfBasic" class="w-full px-4 py-3 text-left text-gray-200 hover:bg-gray-700 flex items-center">
                                    <i class="fas fa-file-alt mr-3 text-blue-400"></i>
                                    <div>
                                        <div class="font-semibold">专业分析报告</div>
                                        <div class="text-xs text-gray-400">仅包含完整专业解读</div>
                                    </div>
                                </button>
                                <button id="exportPdfWithComic" class="w-full px-4 py-3 text-left text-gray-200 hover:bg-gray-700 flex items-center border-t border-gray-700">
                                    <i class="fas fa-images mr-3 text-yellow-400"></i>
                                    <div>
                                        <div class="font-semibold">报告 + AI漫画版</div>
                                        <div class="text-xs text-gray-400">包含专业解读和漫画解读</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                    <button id="generateComicBtn" class="btn-outline px-3 sm:px-6 py-2 sm:py-3 rounded-lg flex items-center pro-feature text-sm sm:text-base" onclick="showComicConfigModal()">
                        <span class="feature-lock-badge">Pro</span>
                        <i class="fas fa-palette sm:mr-2"></i><span class="hidden sm:inline">生成漫画解读版</span>
                    </button>
                    <button id="viewComicBtn" class="btn-outline px-3 sm:px-6 py-2 sm:py-3 rounded-lg flex items-center hidden text-sm sm:text-base">
                        <i class="fas fa-images sm:mr-2"></i><span class="hidden sm:inline">查看漫画</span>
                    </button>
                </div>

                <!-- 🆕 股票走势面板（用户建议放在投资建议摘要前） -->
                ` + stockMarketPanelHtml + `

                <!-- 投资建议摘要（整合关键要点） -->
                <div id="summaryCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6">
                    <h2 class="text-lg md:text-xl font-bold gold-text mb-3 md:mb-4">
                        <i class="fas fa-star mr-2"></i>投资建议摘要
                    </h2>
                    <!-- 核心指标区 -->
                    <div id="summaryContent" class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                        <!-- 动态填充 -->
                    </div>
                    <!-- 关键要点区（整合进来） -->
                    <div id="keyTakeawaysSection" class="border-t border-gray-700 pt-4">
                        <h3 class="text-md font-semibold text-yellow-400 mb-3">
                            <i class="fas fa-lightbulb mr-2"></i>核心要点
                        </h3>
                        <ul id="keyTakeawaysList" class="space-y-2">
                            <!-- 动态填充 -->
                        </ul>
                    </div>
                    <!-- 投资价值评估区 -->
                    <div id="investmentAssessmentSection" class="hidden border-t border-gray-700 pt-4 mt-4">
                        <!-- 动态填充 -->
                    </div>
                </div>

                <!-- 商业模式与护城河分析（独立模块） -->
                <div id="moatCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-yellow-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-chess-rook mr-2"></i>商业模式与护城河
                        </h2>
                        <div id="moatStrengthBadge" class="px-4 py-1 rounded-full text-sm font-semibold">
                            <!-- 护城河强度徽章 -->
                        </div>
                    </div>
                    
                    <!-- 一句话核心结论 -->
                    <div id="moatOneSentence" class="mb-6 p-4 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                        <p class="text-yellow-100 italic"></p>
                    </div>
                    
                    <!-- 三大核心内容卡片 -->
                    <div class="grid md:grid-cols-3 gap-4 mb-6">
                        <!-- 护城河分析 -->
                        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-yellow-600/50 transition">
                            <div class="flex items-center mb-3">
                                <i class="fas fa-shield-alt text-yellow-500 mr-2"></i>
                                <h3 class="font-semibold text-yellow-400">护城河分析</h3>
                            </div>
                            <div id="moatTypeContent" class="text-sm text-gray-300"></div>
                        </div>
                        
                        <!-- 商业模式 -->
                        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-blue-600/50 transition">
                            <div class="flex items-center mb-3">
                                <i class="fas fa-sitemap text-blue-400 mr-2"></i>
                                <h3 class="font-semibold text-blue-400">商业模式</h3>
                            </div>
                            <div id="businessModelContent" class="text-sm text-gray-300"></div>
                        </div>
                        
                        <!-- 企业文化 -->
                        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-green-600/50 transition">
                            <div class="flex items-center mb-3">
                                <i class="fas fa-users text-green-400 mr-2"></i>
                                <h3 class="font-semibold text-green-400">企业文化与治理</h3>
                            </div>
                            <div id="cultureContent" class="text-sm text-gray-300"></div>
                        </div>
                    </div>
                    
                    <!-- 详细解读展开区域 -->
                    <details class="group mt-4">
                        <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-yellow-600/20 to-yellow-500/10 border border-yellow-600/50 rounded-lg hover:from-yellow-600/30 hover:to-yellow-500/20 transition-all flex items-center justify-between">
                            <span class="flex items-center text-yellow-400 font-semibold">
                                <i class="fas fa-book-open mr-2"></i>
                                查看专业深度解读
                            </span>
                            <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-yellow-500"></i>
                        </summary>
                        <div id="moatDetailedContent" class="mt-4 space-y-4 border-t border-gray-700 pt-4">
                            <!-- 动态填充详细内容 -->
                        </div>
                    </details>
                    
                    <!-- 投资含义 -->
                    <div id="investmentImplication" class="mt-4 p-3 bg-gray-800/40 rounded-lg border border-gray-600 hidden">
                        <!-- 动态填充 -->
                    </div>
                </div>

                <!-- 业务洞察（放在商业模式之后、财报数据之前） -->
                <div id="businessInsightCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-cyan-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-lightbulb mr-2"></i>业务洞察
                        </h2>
                        <div id="businessTrendBadge" class="px-4 py-1 rounded-full text-sm font-semibold">
                            <!-- 业务趋势 -->
                        </div>
                    </div>
                    <div id="businessInsightContent" class="text-gray-300 text-sm">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <div>业务洞察数据加载中...</div>
                        </div>
                    </div>
                </div>

                <!-- 财报数据分析（原盈利能力分析，全宽展示） -->
                <div id="profitabilityCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-blue-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-file-invoice-dollar mr-2"></i>财报数据分析
                        </h2>
                        <div id="reportPeriodBadge" class="flex items-center gap-2">
                            <!-- 财报年份来源 - 动态填充 -->
                        </div>
                    </div>
                    
                    <!-- 数据来源说明 -->
                    <div id="dataSourceInfo" class="mb-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg text-xs">
                        <!-- 动态填充数据来源信息 -->
                    </div>
                    
                    <!-- 核心指标概览 -->
                    <div id="financialMetricsOverview" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <!-- 动态填充核心指标 -->
                    </div>
                    
                    <!-- ========== 可视化图表区域 ========== -->
                    <div id="financialChartsSection" class="mb-6 bg-gray-800/40 rounded-xl p-4 border border-gray-700">
                        <!-- 图表标题和控制栏 -->
                        <div class="flex flex-wrap items-center justify-between mb-4 gap-3">
                            <div class="flex items-center gap-2">
                                <i class="fas fa-chart-bar text-blue-400"></i>
                                <span class="font-semibold text-white">主要指标</span>
                                <span class="text-xs text-gray-500">（点击切换指标）</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <select id="chartPeriodSelect" class="period-select" onchange="updateChartPeriod(this.value)">
                                    <option value="all">全部报告期</option>
                                    <option value="annual">仅年报</option>
                                    <option value="semi">仅中报</option>
                                </select>
                                <select id="chartDepthSelect" class="period-select" onchange="updateChartDepth(this.value)">
                                    <option value="12">近12期</option>
                                    <option value="20">长期趋势(20期)</option>
                                </select>
                            </div>
                        </div>
                        
                        <!-- 指标Tab切换 -->
                        <div class="flex flex-wrap gap-2 mb-4 pb-3 border-b border-gray-700">
                            <button class="chart-tab active" data-chart="netProfit" onclick="switchChartTab('netProfit', this)">
                                <i class="fas fa-coins mr-1"></i>归母净利润
                            </button>
                            <button class="chart-tab" data-chart="revenue" onclick="switchChartTab('revenue', this)">
                                <i class="fas fa-shopping-cart mr-1"></i>营业收入
                            </button>
                            <button class="chart-tab" data-chart="operatingProfit" onclick="switchChartTab('operatingProfit', this)">
                                <i class="fas fa-chart-bar mr-1"></i>营业利润
                            </button>
                            <button class="chart-tab" data-chart="eps" onclick="switchChartTab('eps', this)">
                                <i class="fas fa-hand-holding-usd mr-1"></i>每股收益
                            </button>
                            <button class="chart-tab" data-chart="grossMargin" onclick="switchChartTab('grossMargin', this)">
                                <i class="fas fa-percentage mr-1"></i>毛利率
                            </button>
                            <button class="chart-tab" data-chart="netMargin" onclick="switchChartTab('netMargin', this)">
                                <i class="fas fa-chart-pie mr-1"></i>净利率
                            </button>
                            <button class="chart-tab" data-chart="roe" onclick="switchChartTab('roe', this)">
                                <i class="fas fa-chart-line mr-1"></i>ROE
                            </button>
                            <button class="chart-tab" data-chart="debtRatio" onclick="switchChartTab('debtRatio', this)">
                                <i class="fas fa-balance-scale mr-1"></i>资产负债率
                            </button>
                        </div>
                        
                        <!-- 图表+解读面板 并排布局 -->
                        <div class="flex flex-col lg:flex-row gap-4">
                            <!-- 左侧：图表区域 (60%) -->
                            <div class="lg:w-3/5 w-full">
                                <!-- 图例说明 -->
                                <div class="chart-legend mb-3">
                                    <div class="chart-legend-item">
                                        <div class="chart-legend-dot" style="background: #3b82f6;"></div>
                                        <span id="chartValueLabel">归母净利润</span>
                                    </div>
                                    <div class="chart-legend-item">
                                        <div class="chart-legend-dot" style="background: #f97316;"></div>
                                        <span>同比</span>
                                    </div>
                                </div>
                                
                                <!-- ECharts图表容器 -->
                                <div id="mainFinancialChart" class="chart-container"></div>
                                
                                <!-- 数据来源说明 -->
                                <div class="mt-3 text-xs text-gray-500 flex items-center justify-between">
                                    <span>注：最新数据来源于 <span id="chartLatestPeriod">--</span></span>
                                    <span id="chartDataDisclaimer">数据仅供参考</span>
                                </div>
                            </div>
                            
                            <!-- 右侧：趋势解读面板 (40%) -->
                            <div class="lg:w-2/5 w-full">
                                <div id="trendInterpretationPanel" class="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-xl p-4 border border-purple-600/30 h-full">
                                    <!-- 面板标题 -->
                                    <div class="flex items-center gap-2 mb-4 pb-2 border-b border-purple-600/30">
                                        <i class="fas fa-brain text-purple-400"></i>
                                        <span id="interpretationTitle" class="font-semibold text-purple-300">归母净利润趋势解读</span>
                                    </div>
                                    
                                    <!-- 数据概览 -->
                                    <div class="bg-gray-800/50 rounded-lg p-3 mb-3">
                                        <div class="flex items-center gap-2 mb-2">
                                            <i class="fas fa-chart-line text-blue-400 text-xs"></i>
                                            <span class="text-xs text-gray-400">数据概览</span>
                                        </div>
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <div class="text-xs text-gray-500">最新值</div>
                                                <div id="interpretationLatestValue" class="text-xl font-bold text-white">--</div>
                                            </div>
                                            <div>
                                                <div class="text-xs text-gray-500">同比</div>
                                                <div id="interpretationYoyChange" class="text-xl font-bold text-green-400">--</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- 趋势判断 -->
                                    <div class="bg-gray-800/50 rounded-lg p-3 mb-3">
                                        <div class="flex items-center justify-between mb-2">
                                            <div class="flex items-center gap-2">
                                                <i class="fas fa-compass text-yellow-400 text-xs"></i>
                                                <span class="text-xs text-gray-400">趋势判断</span>
                                            </div>
                                            <span id="interpretationTrendBadge" class="px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400">上升</span>
                                        </div>
                                        <p id="interpretationTrendDesc" class="text-sm text-gray-300">近12期整体呈上升趋势。峰值出现在2024年报</p>
                                    </div>
                                    
                                    <!-- 深度洞察 -->
                                    <div class="bg-gray-800/50 rounded-lg p-3 mb-3">
                                        <div class="flex items-center gap-2 mb-2">
                                            <i class="fas fa-lightbulb text-amber-400 text-xs"></i>
                                            <span class="text-xs text-gray-400">深度洞察</span>
                                        </div>
                                        <p id="interpretationInsight" class="text-sm text-gray-300 leading-relaxed">加载中...</p>
                                    </div>
                                    
                                    <!-- 关注点 -->
                                    <div class="bg-gradient-to-r from-red-900/20 to-orange-900/20 rounded-lg p-3 border border-red-600/20">
                                        <div class="flex items-center gap-2 mb-2">
                                            <i class="fas fa-exclamation-triangle text-red-400 text-xs"></i>
                                            <span class="text-xs text-gray-400">关注点</span>
                                        </div>
                                        <p id="interpretationConcerns" class="text-sm text-gray-300 leading-relaxed">加载中...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 三大报表分析卡片 -->
                    <div class="grid md:grid-cols-3 gap-4 mb-6">
                        <!-- 利润表分析 -->
                        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-green-600/50 transition">
                            <div class="flex items-center mb-3">
                                <i class="fas fa-chart-line text-green-400 mr-2"></i>
                                <h3 class="font-semibold text-green-400">利润表分析</h3>
                            </div>
                            <div id="incomeStatementContent" class="text-sm text-gray-300"></div>
                        </div>
                        
                        <!-- 资产负债表分析 -->
                        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-blue-600/50 transition">
                            <div class="flex items-center mb-3">
                                <i class="fas fa-balance-scale text-blue-400 mr-2"></i>
                                <h3 class="font-semibold text-blue-400">资产负债表分析</h3>
                            </div>
                            <div id="balanceSheetContent" class="text-sm text-gray-300"></div>
                        </div>
                        
                        <!-- 现金流量表分析 -->
                        <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700 hover:border-purple-600/50 transition">
                            <div class="flex items-center mb-3">
                                <i class="fas fa-money-bill-wave text-purple-400 mr-2"></i>
                                <h3 class="font-semibold text-purple-400">现金流量表分析</h3>
                            </div>
                            <div id="cashFlowContent" class="text-sm text-gray-300"></div>
                        </div>
                    </div>
                    
                    <!-- 三表联动分析 -->
                    <div id="threeStatementLinkage" class="bg-gray-800/40 rounded-lg p-4 border border-orange-600/30 mb-4">
                        <div class="flex items-center mb-3">
                            <i class="fas fa-link text-orange-400 mr-2"></i>
                            <h3 class="font-semibold text-orange-400">三表联动分析</h3>
                            <span class="ml-2 text-xs text-gray-500">（盈利质量验证）</span>
                        </div>
                        <div id="linkageContent" class="text-sm text-gray-300"></div>
                    </div>
                    
                    <!-- 专业深度解读展开区域 -->
                    <details class="group mt-4">
                        <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-600/50 rounded-lg hover:from-blue-600/30 hover:to-blue-500/20 transition-all flex items-center justify-between">
                            <span class="flex items-center text-blue-400 font-semibold">
                                <i class="fas fa-chart-line mr-2"></i>
                                查看专业深度解读
                            </span>
                            <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-blue-500"></i>
                        </summary>
                        <div id="financialDetailedContent" class="mt-4 space-y-4 border-t border-gray-700 pt-4">
                            <!-- 动态填充详细内容 -->
                        </div>
                    </details>
                </div>
                
                <!-- 风险评估（移到财报分析下方，全宽展示） -->
                <div id="riskCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-red-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-shield-alt mr-2"></i>风险评估
                        </h2>
                        <div id="overallRiskBadge" class="px-4 py-1 rounded-full text-sm font-semibold">
                            <!-- 综合风险等级 -->
                        </div>
                    </div>
                    <div id="riskContent" class="text-gray-300 text-sm"></div>
                </div>

                <!-- 业绩预测（放在风险评估之后、估值评估之前） -->
                <div id="forecastCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-emerald-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-chart-line mr-2"></i>业绩预测
                        </h2>
                        <div id="forecastConfidenceBadge" class="px-4 py-1 rounded-full text-sm font-semibold">
                            <!-- 预测置信度 -->
                        </div>
                    </div>
                    <div id="forecastContent" class="text-gray-300 text-sm">
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <div>业绩预测数据加载中...</div>
                        </div>
                    </div>
                </div>

                <!-- 估值评估（独立模块，完整展示估值分析过程） -->
                <div id="valuationCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-purple-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-calculator mr-2"></i>估值评估
                        </h2>
                        <div id="valuationBadge" class="px-4 py-1 rounded-full text-sm font-semibold">
                            <!-- 估值结论 -->
                        </div>
                    </div>
                    <div id="valuationContent" class="text-gray-300 text-sm"></div>
                </div>

                <!-- 关键要点已整合到投资建议摘要中 -->

                <!-- 行业对比分析面板 -->
                <div id="industryComparisonCard" class="card rounded-xl p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-orange-500 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold gold-text">
                            <i class="fas fa-chart-bar mr-2"></i>行业对比分析
                        </h2>
                        <div class="flex items-center gap-3">
                            <span id="industryName" class="px-3 py-1 bg-orange-600/20 text-orange-400 rounded-full text-sm"></span>
                            <button id="refreshIndustryBtn" class="btn-outline px-3 py-1 rounded-lg text-sm" onclick="loadIndustryComparison()">
                                <i class="fas fa-sync-alt mr-1"></i>刷新
                            </button>
                        </div>
                    </div>
                    
                    <!-- 加载状态 -->
                    <div id="industryComparisonLoading" class="text-center py-8 text-gray-500">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <div>正在加载行业对比数据...</div>
                    </div>
                    
                    <!-- 行业对比内容 -->
                    <div id="industryComparisonContent" class="hidden">
                        <!-- 行业地位摘要 -->
                        <div id="industryPositionSummary" class="mb-6 p-4 bg-orange-900/20 border border-orange-600/30 rounded-lg">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-orange-400 font-semibold">
                                    <i class="fas fa-trophy mr-2"></i>行业地位
                                </span>
                                <span id="industryRankBadge" class="px-3 py-1 rounded-full text-sm font-bold"></span>
                            </div>
                            <p id="industryPositionDesc" class="text-gray-300 text-sm"></p>
                        </div>
                        
                        <!-- 核心指标对比表格 -->
                        <div class="mb-6">
                            <h3 class="text-md font-semibold text-orange-400 mb-3">
                                <i class="fas fa-table mr-2"></i>核心指标排名
                            </h3>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm">
                                    <thead>
                                        <tr class="border-b border-gray-700">
                                            <th class="text-left py-2 px-3 text-gray-400">指标</th>
                                            <th class="text-right py-2 px-3 text-gray-400">本公司</th>
                                            <th class="text-right py-2 px-3 text-gray-400">行业均值</th>
                                            <th class="text-right py-2 px-3 text-gray-400">排名</th>
                                            <th class="text-center py-2 px-3 text-gray-400">评价</th>
                                        </tr>
                                    </thead>
                                    <tbody id="industryMetricsTable">
                                        <!-- 动态填充 -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- 指标对比柱状图（多Tab） -->
                        <div class="mb-6">
                            <h3 class="text-md font-semibold text-orange-400 mb-3">
                                <i class="fas fa-chart-bar mr-2"></i>指标对比柱状图
                            </h3>
                            <!-- Tab切换 -->
                            <div class="flex flex-wrap gap-2 mb-4" id="industryBarChartTabs">
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600/30 text-orange-400 border border-orange-600/50 transition hover:bg-orange-600/40" data-metric="netprofit_margin" onclick="switchIndustryBarChart('netprofit_margin')">净利率</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="grossprofit_margin" onclick="switchIndustryBarChart('grossprofit_margin')">毛利率</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="roe" onclick="switchIndustryBarChart('roe')">ROE</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="roa" onclick="switchIndustryBarChart('roa')">ROA</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="debt_to_assets" onclick="switchIndustryBarChart('debt_to_assets')">资产负债率</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="current_ratio" onclick="switchIndustryBarChart('current_ratio')">流动比率</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="or_yoy" onclick="switchIndustryBarChart('or_yoy')">营收同比</button>
                                <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700" data-metric="netprofit_yoy" onclick="switchIndustryBarChart('netprofit_yoy')">净利润同比</button>
                            </div>
                            <!-- 柱状图容器 -->
                            <div id="industryBarChart" class="h-64 bg-gray-800/30 rounded-lg"></div>
                        </div>
                        
                        <!-- 雷达图对比 -->
                        <div class="grid md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <h3 class="text-md font-semibold text-orange-400 mb-3">
                                    <i class="fas fa-chart-radar mr-2"></i>综合能力雷达图
                                </h3>
                                <div id="industryRadarChart" class="h-64 bg-gray-800/30 rounded-lg"></div>
                            </div>
                            <div>
                                <h3 class="text-md font-semibold text-orange-400 mb-3">
                                    <i class="fas fa-building mr-2"></i>对标公司一览
                                </h3>
                                <div id="peersList" class="space-y-2">
                                    <!-- 动态填充 -->
                                </div>
                            </div>
                        </div>
                        
                        <!-- AI深度分析（可展开） -->
                        <details class="group">
                            <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-orange-600/20 to-orange-500/10 border border-orange-600/50 rounded-lg hover:from-orange-600/30 hover:to-orange-500/20 transition-all flex items-center justify-between">
                                <span class="flex items-center text-orange-400 font-semibold">
                                    <i class="fas fa-brain mr-2"></i>
                                    AI深度行业分析
                                </span>
                                <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-orange-500"></i>
                            </summary>
                            <div id="industryAIAnalysis" class="mt-4 space-y-4 border-t border-gray-700 pt-4 text-sm text-gray-300">
                                <!-- AI分析内容动态填充 -->
                            </div>
                        </details>
                    </div>
                </div>

                <!-- 漫画展示区域 -->
                <div id="comicSection" class="card rounded-xl p-6 mt-6 hidden">
                    <h3 class="text-lg font-semibold gold-text mb-4">
                        <i class="fas fa-palette mr-2"></i>AI 漫画解读
                    </h3>
                    <div id="comicContent" class="grid md:grid-cols-2 gap-4">
                        <!-- 漫画面板动态填充 -->
                    </div>
                    <div id="comicSummary" class="mt-4 text-gray-400 text-sm italic"></div>
                </div>
                
                <!-- 数据来源声明 -->
                <div id="dataSourceSection" class="card rounded-xl p-6 mt-6 bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700">
                    <h2 class="text-xl font-bold gold-text mb-2 flex items-center">
                        <i class="fas fa-database mr-2"></i>数据来源声明
                    </h2>
                    <p class="text-gray-400 text-sm mb-6">本报告数据严格遵循信息来源可追溯原则，所有财务数据均来自以下权威渠道</p>
                    
                    <!-- 主要数据来源 -->
                    <div class="mb-6">
                        <h3 class="text-md font-semibold text-yellow-400 mb-4 flex items-center">
                            <i class="fas fa-star mr-2"></i>主要数据来源（Primary Sources）
                        </h3>
                        <div class="space-y-3">
                            <!-- 上海证券交易所 -->
                            <a href="http://www.sse.com.cn/" target="_blank" class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 hover:bg-gray-800 transition group">
                                <div class="flex items-center">
                                    <span class="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded mr-3">官方披露</span>
                                    <div>
                                        <div class="font-semibold text-white">上海证券交易所</div>
                                        <div class="text-gray-400 text-sm">聚武纪官方披露的定期报告、临时公告等法定信息披露文件</div>
                                    </div>
                                </div>
                                <i class="fas fa-external-link-alt text-gray-500 group-hover:text-yellow-500 transition"></i>
                            </a>
                            <!-- 深圳证券交易所 -->
                            <a href="http://www.szse.cn/" target="_blank" class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 hover:bg-gray-800 transition group">
                                <div class="flex items-center">
                                    <span class="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded mr-3">官方披露</span>
                                    <div>
                                        <div class="font-semibold text-white">深圳证券交易所</div>
                                        <div class="text-gray-400 text-sm">深交所官方披露的定期报告、临时公告等法定信息披露文件</div>
                                    </div>
                                </div>
                                <i class="fas fa-external-link-alt text-gray-500 group-hover:text-yellow-500 transition"></i>
                            </a>
                            <!-- 巨潮资讯网 -->
                            <a href="http://www.cninfo.com.cn/" target="_blank" class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 hover:bg-gray-800 transition group">
                                <div class="flex items-center">
                                    <span class="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded mr-3">官方披露</span>
                                    <div>
                                        <div class="font-semibold text-white">巨潮资讯网</div>
                                        <div class="text-gray-400 text-sm">中国证监会指定信息披露网站，提供上市公司公告原文</div>
                                    </div>
                                </div>
                                <i class="fas fa-external-link-alt text-gray-500 group-hover:text-yellow-500 transition"></i>
                            </a>
                        </div>
                    </div>
                    
                    <!-- 补充数据来源 -->
                    <div class="mb-6">
                        <h3 class="text-md font-semibold text-blue-400 mb-4 flex items-center">
                            <i class="fas fa-plus-circle mr-2"></i>补充数据来源（Supplementary Sources）
                        </h3>
                        <div class="grid md:grid-cols-2 gap-3">
                            <!-- Tushare -->
                            <a href="https://tushare.pro/" target="_blank" class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-blue-600/50 hover:bg-gray-800 transition group">
                                <div class="flex items-center">
                                    <span class="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded mr-3">数据</span>
                                    <div>
                                        <div class="font-semibold text-white text-sm">Tushare 金融数据</div>
                                        <div class="text-gray-400 text-xs">提供实时行情、历史交易数据、财务指标等结构化金融数据</div>
                                    </div>
                                </div>
                                <i class="fas fa-external-link-alt text-gray-500 group-hover:text-blue-500 transition"></i>
                            </a>
                            <!-- 东方财富 -->
                            <a href="https://www.eastmoney.com/" target="_blank" class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-blue-600/50 hover:bg-gray-800 transition group">
                                <div class="flex items-center">
                                    <span class="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded mr-3">媒体</span>
                                    <div>
                                        <div class="font-semibold text-white text-sm">东方财富网</div>
                                        <div class="text-gray-400 text-xs">财务数据解析与可视化，数据来源于上市公司定期报告</div>
                                    </div>
                                </div>
                                <i class="fas fa-external-link-alt text-gray-500 group-hover:text-blue-500 transition"></i>
                            </a>
                            <!-- VectorEngine AI -->
                            <a href="#" class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-blue-600/50 hover:bg-gray-800 transition group">
                                <div class="flex items-center">
                                    <span class="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded mr-3">AI</span>
                                    <div>
                                        <div class="font-semibold text-white text-sm">VectorEngine AI 分析引擎</div>
                                        <div class="text-gray-400 text-xs">AI驱动的财报解读、风险评估与投资建议生成</div>
                                    </div>
                                </div>
                                <i class="fas fa-external-link-alt text-gray-500 group-hover:text-blue-500 transition"></i>
                            </a>
                        </div>
                    </div>
                    
                    <!-- 重要声明 -->
                    <div class="p-4 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                        <h4 class="font-semibold text-yellow-400 mb-2 flex items-center">
                            <i class="fas fa-exclamation-triangle mr-2"></i>重要声明 / Disclaimer
                        </h4>
                        <p class="text-gray-300 text-sm leading-relaxed">
                            本报告所有财务数据均来源于上市公司公开披露的定期报告，经第三方数据服务商结构化处理后呈现。AI分析结论仅供参考，不构成任何投资建议。投资者应以上市公司官方披露为准，并结合自身情况独立做出投资决策。数据更新可能存在延迟，请以最新公告为准。
                        </p>
                    </div>
                </div>
                
                <!-- 页脚版权信息 -->
                <div class="text-center text-gray-500 text-sm mt-8 mb-4">
                    <p>© 2025 Finspark 投资分析系统 · 示例报告基于 Tushare 数据</p>
                </div>
            </div>
        </div>
    </main>

    <!-- 漫画IP角色选择弹窗 -->
    <div id="comicConfigModal" class="modal">
        <div class="card rounded-xl p-6 max-w-2xl mx-4">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold gold-gradient">
                    <i class="fas fa-palette mr-2"></i>漫画解读版配置
                </h3>
                <button onclick="hideComicConfigModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
            
            <!-- 角色模式选择（新增） -->
            <div class="mb-6 border-b border-gray-700 pb-4">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-users mr-2"></i>角色模式</h4>
                <div class="grid grid-cols-2 gap-3">
                    <label id="singleCharMode" class="character-mode-option cursor-pointer p-3 rounded-lg border-2 border-yellow-500 bg-yellow-900/20 text-center" data-mode="single">
                        <input type="radio" name="characterMode" value="single" checked class="hidden">
                        <div class="text-2xl mb-1">👤</div>
                        <div class="text-sm text-yellow-300 font-semibold">单角色模式</div>
                        <div class="text-xs text-gray-400 mt-1">一个IP角色贯穿8格</div>
                    </label>
                    <label id="multiCharMode" class="character-mode-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-purple-400 text-center" data-mode="multi">
                        <input type="radio" name="characterMode" value="multi" class="hidden">
                        <div class="text-2xl mb-1">👥</div>
                        <div class="text-sm text-purple-300 font-semibold">多角色主题模式</div>
                        <div class="text-xs text-gray-400 mt-1">每格使用不同角色</div>
                        <span class="inline-block mt-1 px-2 py-0.5 bg-purple-600 text-xs text-white rounded">NEW</span>
                    </label>
                </div>
                <p id="characterModeDesc" class="text-xs text-gray-500 mt-2 ml-1">
                    <span class="text-yellow-400">👤 单角色模式</span>：选择一个IP角色统一演绎整个8格漫画
                </p>
            </div>
            
            <!-- IP角色选择（单角色模式显示） -->
            <div id="singleCharacterSection" class="mb-6">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-user-circle mr-2"></i>选择演绎角色</h4>
                <div id="characterSetList" class="space-y-4">
                    <!-- 哪吒电影角色集 -->
                    <div class="border border-yellow-600/50 rounded-lg p-4 bg-yellow-900/10">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center">
                                <span class="text-yellow-400 font-bold">🏆 哪吒之魔童降世</span>
                                <span class="ml-2 px-2 py-0.5 bg-yellow-600 text-xs text-black rounded">默认推荐</span>
                            </div>
                        </div>
                        <div id="nezhaCharacters" class="grid grid-cols-3 md:grid-cols-6 gap-2">
                            <div class="character-option selected cursor-pointer p-2 rounded-lg border-2 border-red-500 bg-red-900/20 text-center" data-set="nezha-movie" data-char="nezha">
                                <div class="text-2xl mb-1">🔥</div>
                                <div class="text-xs text-red-300 font-semibold">哪吒</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-blue-400 text-center" data-set="nezha-movie" data-char="aobing">
                                <div class="text-2xl mb-1">🐉</div>
                                <div class="text-xs text-blue-300">敖丙</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-amber-400 text-center" data-set="nezha-movie" data-char="taiyi">
                                <div class="text-2xl mb-1">🐷</div>
                                <div class="text-xs text-amber-300">太乙真人</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-purple-400 text-center" data-set="nezha-movie" data-char="shen-gongbao">
                                <div class="text-2xl mb-1">🐆</div>
                                <div class="text-xs text-purple-300">申公豹</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-amber-400 text-center" data-set="nezha-movie" data-char="li-jing">
                                <div class="text-2xl mb-1">⚔️</div>
                                <div class="text-xs text-amber-200">李靖</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-pink-400 text-center" data-set="nezha-movie" data-char="yin-shi">
                                <div class="text-2xl mb-1">🌸</div>
                                <div class="text-xs text-pink-300">殷夫人</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 商业经典角色集 -->
                    <div class="border border-gray-600 rounded-lg p-4 bg-gray-800/30">
                        <div class="flex items-center mb-3">
                            <span class="text-blue-400 font-bold">💼 商业经典角色</span>
                        </div>
                        <div id="businessCharacters" class="grid grid-cols-4 gap-2">
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-yellow-400 text-center" data-set="business-classic" data-char="finance-butler">
                                <div class="text-2xl mb-1">🪙</div>
                                <div class="text-xs text-yellow-300">金币先生</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-cyan-400 text-center" data-set="business-classic" data-char="tech-robot">
                                <div class="text-2xl mb-1">🤖</div>
                                <div class="text-xs text-cyan-300">科技小智</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-red-400 text-center" data-set="business-classic" data-char="wine-master">
                                <div class="text-2xl mb-1">🍶</div>
                                <div class="text-xs text-red-300">酒仙翁</div>
                            </div>
                            <div class="character-option cursor-pointer p-2 rounded-lg border border-gray-600 hover:border-green-400 text-center" data-set="business-classic" data-char="medicine-doc">
                                <div class="text-2xl mb-1">💊</div>
                                <div class="text-xs text-green-300">药丸博士</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 多角色主题选择（多角色模式显示）-->
            <div id="multiCharacterSection" class="mb-6 hidden">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-theater-masks mr-2"></i>选择IP主题系列</h4>
                <div id="themeList" class="grid grid-cols-2 gap-3">
                    <!-- 哪吒系列 -->
                    <div class="theme-option selected cursor-pointer p-3 rounded-lg border-2 border-yellow-500 bg-yellow-900/20" data-theme="nezha-universe">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">🔥</span>
                            <span class="text-yellow-300 font-bold">哪吒系列</span>
                            <span class="ml-auto px-2 py-0.5 bg-yellow-600 text-xs text-black rounded">默认</span>
                        </div>
                        <div class="text-xs text-gray-400">哪吒、敖丙、太乙真人、申公豹、李靖、殷夫人</div>
                    </div>
                    <!-- 疯狂动物城 -->
                    <div class="theme-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-orange-400" data-theme="zootopia">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">🦊</span>
                            <span class="text-orange-300 font-bold">疯狂动物城</span>
                        </div>
                        <div class="text-xs text-gray-400">朱迪、尼克、闪电、狮市长等</div>
                    </div>
                    <!-- 疯狂原始人 -->
                    <div class="theme-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-amber-400" data-theme="the-croods">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">🦴</span>
                            <span class="text-amber-300 font-bold">疯狂原始人</span>
                        </div>
                        <div class="text-xs text-gray-400">瓜哥、小伊、盖、奶奶等</div>
                    </div>
                    <!-- 迪士尼公主 -->
                    <div class="theme-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-pink-400" data-theme="disney-princess">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">👑</span>
                            <span class="text-pink-300 font-bold">迪士尼公主</span>
                        </div>
                        <div class="text-xs text-gray-400">白雪公主、艾莎、茉莉等</div>
                    </div>
                    <!-- 米奇妙妙屋 -->
                    <div class="theme-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-red-400" data-theme="mickey-clubhouse">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">🐭</span>
                            <span class="text-red-300 font-bold">米奇妙妙屋</span>
                        </div>
                        <div class="text-xs text-gray-400">米奇、米妮、唐老鸭、高飞等</div>
                    </div>

                    <!-- 英雄联盟 -->
                    <div class="theme-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-purple-400" data-theme="league-of-legends">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">⚔️</span>
                            <span class="text-purple-300 font-bold">英雄联盟</span>
                        </div>
                        <div class="text-xs text-gray-400">盖伦、亚索、金克丝等</div>
                    </div>
                    <!-- 商业经典 -->
                    <div class="theme-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-cyan-400" data-theme="business-original">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">💼</span>
                            <span class="text-cyan-300 font-bold">商业经典角色</span>
                        </div>
                        <div class="text-xs text-gray-400">金币先生、科技小智、酒仙翁等</div>
                    </div>
                </div>
                <p id="themeDesc" class="text-xs text-gray-500 mt-2 ml-1">
                    <span class="text-yellow-400">🔥 哪吒系列</span>：中国神话风格，AI将根据每格内容自动分配最合适的角色
                </p>
                <!-- AI角色分配选项 -->
                <div class="mt-3 p-3 rounded-lg bg-gray-800/50">
                    <label class="flex items-center cursor-pointer">
                        <input type="checkbox" id="letAIChoose" checked class="mr-2 accent-purple-500 w-4 h-4">
                        <span class="text-gray-300 text-sm">让AI自动为每格选择最合适的角色</span>
                        <span class="ml-2 px-2 py-0.5 bg-purple-600 text-xs text-white rounded">推荐</span>
                    </label>
                    <p class="text-xs text-gray-500 mt-1 ml-6">AI将根据每格的财务内容主题，智能匹配该主题下最适合表达的角色</p>
                </div>
            </div>
            
            <!-- 内容风格选择（新增）-->
            <div class="mb-6">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-paint-brush mr-2"></i>内容风格</h4>
                <div id="contentStyleList" class="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <!-- 规范4步分析 -->
                    <div class="content-style-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-blue-400 text-center transition-all" data-style="structured">
                        <div class="text-2xl mb-1">📊</div>
                        <div class="text-xs text-blue-300 font-semibold">规范4步分析</div>
                        <div class="text-xs text-gray-500 mt-1">每格4小格</div>
                    </div>
                    <!-- 自由创意（默认）-->
                    <div class="content-style-option selected cursor-pointer p-3 rounded-lg border-2 border-yellow-500 bg-yellow-900/20 text-center transition-all" data-style="creative">
                        <div class="text-2xl mb-1">🎨</div>
                        <div class="text-xs text-yellow-300 font-semibold">自由创意</div>
                        <div class="text-xs text-gray-500 mt-1">布局灵活</div>
                    </div>
                    <!-- 学术论文风格 -->
                    <div class="content-style-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-purple-400 text-center transition-all" data-style="academic">
                        <div class="text-2xl mb-1">📚</div>
                        <div class="text-xs text-purple-300 font-semibold">学术论文</div>
                        <div class="text-xs text-gray-500 mt-1">严谨专业</div>
                    </div>
                    <!-- 叙事故事风格 -->
                    <div class="content-style-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-green-400 text-center transition-all" data-style="story">
                        <div class="text-2xl mb-1">📖</div>
                        <div class="text-xs text-green-300 font-semibold">叙事故事</div>
                        <div class="text-xs text-gray-500 mt-1">情节化展示</div>
                    </div>
                    <!-- 数据仪表盘 -->
                    <div class="content-style-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-cyan-400 text-center transition-all" data-style="dashboard">
                        <div class="text-2xl mb-1">📈</div>
                        <div class="text-xs text-cyan-300 font-semibold">数据仪表盘</div>
                        <div class="text-xs text-gray-500 mt-1">数据密集</div>
                    </div>
                </div>
                <p id="contentStyleDesc" class="text-xs text-gray-500 mt-2 ml-1">
                    <span class="text-yellow-400">🎨 自由创意</span>：布局灵活多变，模型自由发挥，让每格都独特有趣
                </p>
            </div>
            
            <!-- 展示布局选择 -->
            <div class="mb-6">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-th mr-2"></i>展示布局</h4>
                <div class="grid grid-cols-2 gap-3">
                    <label class="layout-option cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-yellow-400 text-center" data-layout="single-column">
                        <input type="radio" name="displayLayout" value="single-column" class="hidden">
                        <div class="text-2xl mb-2">📜</div>
                        <div class="text-sm text-yellow-300 font-semibold">单列长图</div>
                        <div class="text-xs text-gray-400 mt-1">1列 × 8行 纵向排列</div>
                    </label>
                    <label class="layout-option cursor-pointer p-3 rounded-lg border-2 border-blue-500 bg-blue-900/20 text-center" data-layout="double-column">
                        <input type="radio" name="displayLayout" value="double-column" checked class="hidden">
                        <div class="text-2xl mb-2">🖼️</div>
                        <div class="text-sm text-blue-300 font-semibold">双列网格</div>
                        <div class="text-xs text-gray-400 mt-1">2列 × 4行 紧凑展示</div>
                    </label>
                </div>
            </div>
            
            <!-- 输出格式选择（微信公众号导出） -->
            <div class="mb-6">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-file-image mr-2"></i>导出格式</h4>
                <div class="flex gap-4">
                    <label class="flex items-center cursor-pointer">
                        <input type="radio" name="outputFormat" value="grid" checked class="mr-2 accent-yellow-500">
                        <span class="text-gray-300">🌐 网页版</span>
                    </label>
                    <label class="flex items-center cursor-pointer">
                        <input type="radio" name="outputFormat" value="vertical-scroll" class="mr-2 accent-yellow-500">
                        <span class="text-gray-300">📱 微信公众号长图</span>
                    </label>
                </div>
            </div>
            
            <!-- 高质量模式选项 -->
            <div class="mb-6 border-t border-gray-700 pt-4">
                <h4 class="text-sm text-gray-400 mb-3"><i class="fas fa-gem mr-2"></i>图片质量增强</h4>
                
                <!-- 选项1: Nano Banana 模式 (默认) -->
                <div class="mb-3 p-3 rounded-lg border-2 border-yellow-500 bg-yellow-900/20 transition-colors">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="qualityMode" value="nanoBanana" checked class="mr-2 accent-yellow-500 w-4 h-4">
                                <span class="text-yellow-300 font-semibold">🍌 Nano Banana 模式</span>
                            </label>
                            <span class="ml-2 px-2 py-0.5 bg-yellow-600 text-xs text-black font-bold rounded">默认推荐</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-1 ml-6">
                        使用结构化JSON提示词，生成高质量信息图表风格漫画
                    </p>
                </div>
                
                <!-- 选项2: Comic Prompt Builder 模式 -->
                <div class="mb-3 p-3 rounded-lg border border-gray-700 hover:border-cyan-600/50 transition-colors">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center">
                            <label class="flex items-center cursor-pointer">
                                <input type="radio" name="qualityMode" value="promptBuilder" class="mr-2 accent-cyan-500 w-4 h-4">
                                <span class="text-gray-300">🎨 Comic Prompt Builder</span>
                            </label>
                            <span class="ml-2 px-2 py-0.5 bg-cyan-600 text-xs text-white rounded">实验性</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1 ml-6">
                        参考 <a href="https://prompt.aigc.green/" target="_blank" class="text-cyan-400 hover:underline">prompt.aigc.green</a> 专业摄影参数结构
                    </p>
                </div>
                
                <!-- 选项3: 标准模式 -->
                <div class="p-3 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors">
                    <div class="flex items-center">
                        <label class="flex items-center cursor-pointer">
                            <input type="radio" name="qualityMode" value="standard" class="mr-2 accent-gray-500 w-4 h-4">
                            <span class="text-gray-400">📷 标准模式</span>
                        </label>
                    </div>
                    <p class="text-xs text-gray-500 mt-1 ml-6">
                        快速生成，质量一般
                    </p>
                </div>
            </div>
            
            <!-- 生成按钮 -->
            <div class="flex gap-4 justify-end">
                <button onclick="hideComicConfigModal()" class="btn-outline px-6 py-2 rounded-lg">取消</button>
                <button onclick="startGenerateComic()" class="btn-gold px-6 py-2 rounded-lg">
                    <i class="fas fa-magic mr-2"></i>开始生成
                </button>
            </div>
        </div>
    </div>
    
    <!-- 漫画生成中弹窗 -->
    <div id="comicModal" class="modal">
        <div class="card rounded-xl p-8 max-w-lg mx-4 text-center">
            <div class="loading-spinner mx-auto mb-4"></div>
            <h3 class="text-lg font-semibold gold-text mb-2">漫画解读版生成中</h3>
            <p id="comicModalCharacter" class="text-yellow-400 text-sm mb-2"></p>
            <!-- 进度条 -->
            <div class="w-full bg-gray-700/50 rounded-full h-3 mb-3 overflow-hidden">
                <div id="comicProgressBar" class="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out" style="width: 0%"></div>
            </div>
            <p id="comicModalStatus" class="text-gray-300 text-sm whitespace-pre-line">正在将财报分析转化为8页专业漫画...</p>
            <p class="text-gray-500 text-xs mt-3">首次生成需要 2-3 分钟，后续用户可秒级查看</p>
            <button id="stopComicGeneration" onclick="stopComicGeneration()" class="mt-4 px-4 py-2 rounded-lg text-sm bg-red-600/80 hover:bg-red-500 text-white transition-all">
                <i class="fas fa-stop mr-2"></i>停止生成
            </button>
        </div>
    </div>
    
    <!-- 漫画角色变更确认弹窗 -->
    <div id="comicConfirmModal" class="modal">
        <div class="card rounded-xl p-6 max-w-md mx-4">
            <h3 class="text-lg font-semibold gold-text mb-3 text-center">
                <i class="fas fa-exchange-alt mr-2"></i>检测到已有漫画
            </h3>
            <p id="comicConfirmMessage" class="text-gray-300 text-sm mb-4 text-center leading-relaxed"></p>
            <div class="flex gap-3 justify-center">
                <button id="comicConfirmView" class="px-5 py-2.5 rounded-lg text-sm bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-medium transition-all shadow-lg">
                    <i class="fas fa-eye mr-2"></i>查看现有漫画
                </button>
                <button id="comicConfirmRegenerate" class="px-5 py-2.5 rounded-lg text-sm bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-medium transition-all shadow-lg">
                    <i class="fas fa-sync-alt mr-2"></i>重新生成
                </button>
            </div>
            <p class="text-gray-500 text-xs mt-3 text-center">重新生成约需 2-3 分钟</p>
        </div>
    </div>

    <script>
        // 获取URL参数
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const name = urlParams.get('name');
        const presetIdFromUrl = urlParams.get('presetId');
        const modelFromUrl = urlParams.get('model');
        
        if (!code) {
            window.location.href = '/';
        }
        
        // 全局状态
        let currentReportId = null;
        let currentReport = null;
        let analysisPresetOverrides = null;
        
        // 初始化分析配置覆盖（如果URL中有配置参数）
        if (presetIdFromUrl || modelFromUrl) {
            analysisPresetOverrides = {};
            if (presetIdFromUrl) analysisPresetOverrides.globalPresetId = parseInt(presetIdFromUrl);
            if (modelFromUrl) analysisPresetOverrides.globalModelPreference = modelFromUrl;
        }
        
        // 为智能助手暴露全局变量
        window.currentStockCode = code;
        window.currentStockName = name;
        window.hasAnalysisReport = false;
        
        // 漫画配置状态
        let selectedCharacterSet = 'nezha-movie';
        let selectedCharacterId = 'nezha';
        let selectedOutputFormat = 'grid';
        let selectedDisplayLayout = 'double-column'; // 默认双列布局 'single-column' or 'double-column'
        let selectedContentStyle = 'creative'; // 默认自由创意风格
        
        // 多角色主题模式配置（新）
        let useMultiCharacterMode = false; // 是否启用多角色主题模式
        let selectedThemeId = 'nezha-universe'; // 当前选中的主题ID（与后端API保持一致）
        let letAIChooseCharacters = true; // 让AI自动选择每格角色
        
        // 内容风格名称和描述映射
        const contentStyleNames = {
            'structured': '规范4步分析',
            'creative': '自由创意',
            'academic': '学术论文',
            'story': '叙事故事',
            'dashboard': '数据仪表盘'
        };
        const contentStyleDescriptions = {
            'structured': '📊 规范4步分析：每格包含4个标准化子格，结构规整，适合严格的财务分析展示',
            'creative': '🎨 自由创意：布局灵活多变，模型自由发挥，让每格都独特有趣',
            'academic': '📚 学术论文：严谨专业的学术风格，强调数据准确性与分析逻辑',
            'story': '📖 叙事故事：以故事情节展开，让财报分析更加生动有趣',
            'dashboard': '📈 数据仪表盘：数据密集型展示，多图表多指标并行呈现'
        };
        
        // 角色名称映射
        const characterNames = {
            'nezha': '哪吒',
            'aobing': '敖丙',
            'taiyi': '太乙真人',
            'shen-gongbao': '申公豹',
            'li-jing': '李靖',
            'yin-shi': '殷夫人',
            'finance-butler': '金币先生',
            'tech-robot': '科技小智',
            'wine-master': '酒仙翁',
            'medicine-doc': '药丸博士'
        };
        
        // 主题名称映射（新增）- 与后端API保持一致
        const themeNames = {
            'nezha-universe': '哪吒宇宙',
            'zootopia': '疯狂动物城',
            'the-croods': '疯狂原始人',
            'disney-princess': '迪士尼公主',
            'mickey-clubhouse': '米奇妙妙屋',
            'league-of-legends': '英雄联盟',
            'business-original': '商业原创角色'
        };
        
        // 主题描述
        const themeDescriptions = {
            'nezha-universe': '中国神话风格，包含哪吒、敖丙、太乙真人、申公豹、李靖、殷夫人等角色',
            'zootopia': '现代都市动物风格，朱迪、尼克、闪电等角色，适合表现商业故事',
            'the-croods': '原始人冒险风格，瓜哥、小伊等角色，适合风险和挑战主题',
            'disney-princess': '迪士尼公主系列，白雪、艾莎、茉莉等角色，优雅梦幻',
            'mickey-clubhouse': '迪士尼经典风格，米奇、米妮、唐老鸭、高飞等角色',
            'league-of-legends': '电竞战斗风格，盖伦、亚索、金克丝等角色，适合科技和竞争主题',
            'business-original': '商业专业风格，金币先生、科技小智等角色，适合正式的财务分析'
        };
        
        // 显示公司信息
        document.getElementById('companyName').textContent = name || code;
        document.getElementById('companyCode').textContent = code;
        
        // Agent名称映射
        const agentNames = ['PLANNING', 'PROFITABILITY', 'BALANCE_SHEET', 'CASH_FLOW', 'EARNINGS_QUALITY', 'RISK', 'BUSINESS_INSIGHT', 'BUSINESS_MODEL', 'FORECAST', 'FINAL_CONCLUSION'];
        
        // ============ 权限管理（分析页） ============
        let currentPermissions = null;
        
        function setPermissions(perms) {
            currentPermissions = perms;
            localStorage.setItem('permissions', JSON.stringify(perms));
        }
        
        function getPermissions() {
            if (currentPermissions) return currentPermissions;
            const stored = localStorage.getItem('permissions');
            return stored ? JSON.parse(stored) : null;
        }
        
        // 显示升级提示
        function showUpgradePrompt(message, needLogin = false) {
            if (needLogin) {
                const goLogin = confirm(message + '\\n\\n点击"确定"前往登录');
                if (goLogin) {
                    window.location.href = '/?showLogin=true';
                }
            } else {
                const goUpgrade = confirm(message + '\\n\\n点击"确定"前往会员中心');
                if (goUpgrade) {
                    window.location.href = '/membership';
                }
            }
        }
        
        // 获取认证令牌
        function getAuthToken() {
            return localStorage.getItem('accessToken');
        }
        
        // 获取认证请求头
        function getAuthHeaders() {
            const token = getAuthToken();
            return token ? { 'Authorization': \`Bearer \${token}\` } : {};
        }
        
        // 初始化权限（从 API 获取最新权限）
        async function initPermissions() {
            const token = getAuthToken();
            if (token) {
                try {
                    const response = await fetch('/api/auth/me', {
                        headers: { 'Authorization': \`Bearer \${token}\` }
                    });
                    const data = await response.json();
                    if (data.success && data.permissions) {
                        setPermissions(data.permissions);
                        console.log('[Auth] Permissions loaded:', data.permissions);
                    }
                } catch (error) {
                    console.error('[Auth] Failed to load permissions:', error);
                }
            } else {
                // 访客模式，尝试初始化访客会话
                try {
                    const guestId = localStorage.getItem('guestSessionId') || localStorage.getItem('guestFingerprint');
                    if (guestId) {
                        const response = await fetch('/api/user/guest/init', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fingerprint: guestId })
                        });
                        const data = await response.json();
                        if (data.success && data.permissions) {
                            setPermissions(data.permissions);
                            console.log('[Auth] Guest permissions loaded:', data.permissions);
                        }
                    }
                } catch (error) {
                    console.error('[Auth] Failed to init guest session:', error);
                }
            }
        }
        
        // 检查是否有已存在的分析报告（通过 reportId URL参数或检查最近报告）
        async function checkExistingReport() {
            // 1. 检查 URL 中是否有 reportId 参数
            const reportIdFromUrl = urlParams.get('reportId');
            if (reportIdFromUrl) {
                console.log('[Init] Loading report from URL param:', reportIdFromUrl);
                try {
                    const response = await fetch(\`/api/analyze/result/\${reportIdFromUrl}\`);
                    const data = await response.json();
                    if (data.success && data.report && data.report.status === 'completed') {
                        currentReportId = parseInt(reportIdFromUrl);
                        currentReport = data.report;
                        displayResults(data.report);
                        document.getElementById('favoriteBtn').classList.remove('hidden');
                        document.getElementById('analysisStatus').innerHTML = \`
                            <div class="text-sm text-gray-400">分析状态</div>
                            <div class="text-lg text-green-500 font-semibold">已完成</div>
                        \`;
                        document.getElementById('progressBar').style.width = '100%';
                        document.getElementById('progressPercent').textContent = '100%';
                        document.getElementById('currentPhase').textContent = '分析完成';
                        return true;
                    }
                } catch (error) {
                    console.error('[Init] Failed to load report from URL:', error);
                }
            }
            
            // 2. 检查该股票是否有最近的已完成报告
            try {
                const response = await fetch(\`/api/reports/recent?code=\${code}&limit=1\`);
                const data = await response.json();
                if (data.success && data.data && data.data.length > 0) {
                    const recentReport = data.data[0];
                    if (recentReport.company_code === code && recentReport.status === 'completed') {
                        console.log('[Init] Found recent completed report:', recentReport.id);
                        // 加载完整报告
                        const fullResponse = await fetch(\`/api/analyze/result/\${recentReport.id}\`);
                        const fullData = await fullResponse.json();
                        if (fullData.success && fullData.report) {
                            currentReportId = recentReport.id;
                            currentReport = fullData.report;
                            displayResults(fullData.report);
                            document.getElementById('favoriteBtn').classList.remove('hidden');
                            // 显示重新分析按钮，方便用户更新报告
                            document.getElementById('reanalyzeBtn').classList.remove('hidden');
                            document.getElementById('analysisStatus').innerHTML = \`
                                <div class="text-sm text-gray-400">分析状态</div>
                                <div class="text-lg text-green-500 font-semibold">
                                    <i class="fas fa-history mr-1"></i>历史报告
                                </div>
                                <div class="text-xs text-gray-500 mt-1">点击"重新分析"可更新</div>
                            \`;
                            document.getElementById('progressBar').style.width = '100%';
                            document.getElementById('progressPercent').textContent = '100%';
                            document.getElementById('currentPhase').textContent = '加载历史报告';
                            return true;
                        }
                    }
                }
            } catch (error) {
                console.error('[Init] Failed to check recent reports:', error);
            }
            
            return false;
        }
        
        // 页面加载时自动检查是否有已存在的报告
        (async function initPage() {
            // 先初始化权限
            await initPermissions();
            
            const hasExisting = await checkExistingReport();
            if (!hasExisting) {
                console.log('[Init] No existing report found, ready for new analysis');
            }
        })();
        
        // 开始分析
        async function startAnalysis() {
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                };
                
                // 构建请求体，包含分析配置参数
                const requestBody = {
                    companyCode: code,
                    companyName: name,
                    reportType: 'annual',
                    options: {
                        includeBusinessModel: true,
                        includeForecast: true,
                    }
                };
                
                // 如果有配置覆盖参数，添加到请求中
                if (analysisPresetOverrides) {
                    requestBody.presetOverrides = analysisPresetOverrides;
                    console.log('[Analysis Config] Using preset overrides:', analysisPresetOverrides);
                }
                
                const response = await fetch('/api/analyze/start', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    currentReportId = data.reportId;
                    
                    // 检查是否命中缓存（秒级返回）
                    if (data.cached) {
                        console.log('[Cache Hit] Using cached analysis result');
                        document.getElementById('analysisStatus').innerHTML = \`
                            <div class="text-sm text-gray-400">分析状态</div>
                            <div class="text-lg text-green-500 font-semibold">
                                <i class="fas fa-bolt mr-1"></i>秒级响应
                            </div>
                            <div class="text-xs text-gray-500 mt-1">使用24小时内缓存结果</div>
                        \`;
                    } else if (data.pending) {
                        console.log('[Pending] Another user is analyzing this stock');
                        document.getElementById('analysisStatus').innerHTML = \`
                            <div class="text-sm text-gray-400">分析状态</div>
                            <div class="text-lg text-yellow-500 font-semibold">
                                <i class="fas fa-users mr-1"></i>共享分析中
                            </div>
                            <div class="text-xs text-gray-500 mt-1">其他用户正在分析，共享结果中...</div>
                        \`;
                    }
                    
                    // 开始监听进度
                    pollStatus(data.reportId);
                } else {
                    alert('启动分析失败: ' + data.error);
                }
            } catch (error) {
                console.error('Start analysis error:', error);
            }
        }
        
        // ============ 历史对比功能 ============
        let compareOptions = [];
        let selectedCompareId = null;
        
        // 显示对比弹窗
        async function showCompareModal() {
            if (!currentReportId) {
                alert('请等待分析完成后再进行对比');
                return;
            }
            
            showModal('compareModal');
            document.getElementById('compareSelectSection').classList.remove('hidden');
            document.getElementById('compareResultSection').classList.add('hidden');
            
            // 加载可对比的报告列表
            await loadCompareOptions();
        }
        
        // 加载可对比的历史报告
        async function loadCompareOptions() {
            const container = document.getElementById('compareOptions');
            container.innerHTML = '<div class="text-center py-8 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>';
            
            try {
                const response = await fetch(\`/api/reports/\${currentReportId}/compare-options\`);
                const data = await response.json();
                
                if (data.success && data.compareOptions.length > 0) {
                    compareOptions = data.compareOptions;
                    container.innerHTML = data.compareOptions.map((opt, index) => \`
                        <div class="card p-3 rounded-lg cursor-pointer hover:border-purple-500 transition-all" onclick="selectCompareReport(\${opt.id})">
                            <div class="flex justify-between items-center">
                                <div>
                                    <span class="text-white font-medium">\${opt.company_name}</span>
                                    <span class="text-gray-500 text-sm ml-2">\${opt.report_period || ''}</span>
                                </div>
                                <div class="text-right">
                                    <div class="text-sm text-gray-400">\${formatDate(opt.created_at)}</div>
                                    \${opt.score ? \`<div class="text-xs \${opt.score >= 70 ? 'text-green-400' : opt.score >= 50 ? 'text-yellow-400' : 'text-red-400'}">评分: \${opt.score}</div>\` : ''}
                                </div>
                            </div>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = \`
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-info-circle mr-2"></i>
                            暂无历史报告可供对比<br>
                            <span class="text-xs">同一公司的多次分析才能进行对比</span>
                        </div>
                    \`;
                }
            } catch (error) {
                console.error('Load compare options error:', error);
                container.innerHTML = '<div class="text-center py-8 text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>加载失败</div>';
            }
        }
        
        // 格式化日期
        function formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        
        // 选择对比报告
        async function selectCompareReport(compareId) {
            selectedCompareId = compareId;
            
            // 显示加载状态
            document.getElementById('compareSelectSection').classList.add('hidden');
            document.getElementById('compareResultSection').classList.remove('hidden');
            document.getElementById('metricsChanges').innerHTML = '<div class="text-center py-4 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>正在对比分析...</div>';
            
            try {
                const response = await fetch(\`/api/reports/\${currentReportId}/compare?compareWith=\${compareId}\`);
                const data = await response.json();
                
                if (data.success) {
                    renderComparisonResult(data.comparison);
                } else {
                    document.getElementById('metricsChanges').innerHTML = '<div class="text-center py-4 text-red-400">对比失败: ' + data.error + '</div>';
                }
            } catch (error) {
                console.error('Compare error:', error);
                document.getElementById('metricsChanges').innerHTML = '<div class="text-center py-4 text-red-400">对比失败，请重试</div>';
            }
        }
        
        // 渲染对比结果
        function renderComparisonResult(comparison) {
            const { summary, changes } = comparison;
            
            // 趋势图标和文字
            const trendConfig = {
                improving: { icon: '📈', text: '整体向好', desc: '多项指标改善', color: 'text-green-400', bg: 'bg-green-500/20' },
                declining: { icon: '📉', text: '需要关注', desc: '部分指标下滑', color: 'text-red-400', bg: 'bg-red-500/20' },
                stable: { icon: '➡️', text: '基本稳定', desc: '指标变化不大', color: 'text-blue-400', bg: 'bg-blue-500/20' }
            };
            const trend = trendConfig[summary.overallTrend] || trendConfig.stable;
            
            document.getElementById('trendIcon').className = \`w-12 h-12 rounded-full flex items-center justify-center text-2xl \${trend.bg}\`;
            document.getElementById('trendIcon').textContent = trend.icon;
            document.getElementById('trendText').className = \`text-lg font-semibold \${trend.color}\`;
            document.getElementById('trendText').textContent = trend.text;
            document.getElementById('trendDesc').textContent = trend.desc + \` (\${summary.improvedCount}项改善, \${summary.declinedCount}项下滑)\`;
            
            // 亮点和隐忧
            document.getElementById('highlightsAndConcerns').innerHTML = \`
                <div>
                    <div class="text-sm font-medium text-green-400 mb-2"><i class="fas fa-arrow-up mr-1"></i>亮点</div>
                    <ul class="text-sm text-gray-300 space-y-1">
                        \${summary.highlights.length > 0 
                            ? summary.highlights.map(h => \`<li>• \${h}</li>\`).join('') 
                            : '<li class="text-gray-500">无明显改善指标</li>'}
                    </ul>
                </div>
                <div>
                    <div class="text-sm font-medium text-red-400 mb-2"><i class="fas fa-arrow-down mr-1"></i>关注</div>
                    <ul class="text-sm text-gray-300 space-y-1">
                        \${summary.concerns.length > 0 
                            ? summary.concerns.map(c => \`<li>• \${c}</li>\`).join('') 
                            : '<li class="text-gray-500">无明显下滑指标</li>'}
                    </ul>
                </div>
            \`;
            
            // 指标变化详情
            document.getElementById('metricsChanges').innerHTML = changes.map(change => {
                const trendArrow = change.trend === 'up' ? '↑' : change.trend === 'down' ? '↓' : '→';
                const trendClass = change.trend === 'up' ? 'text-green-400' : change.trend === 'down' ? 'text-red-400' : 'text-gray-400';
                const changeText = change.changePercent !== 0 ? \`\${change.changePercent > 0 ? '+' : ''}\${change.changePercent.toFixed(1)}%\` : '持平';
                
                return \`
                    <div class="flex items-center justify-between py-2 border-b border-gray-700/50">
                        <div class="flex items-center gap-3">
                            <span class="\${trendClass} text-lg">\${trendArrow}</span>
                            <span class="text-white">\${change.metricName}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-gray-400">\${formatMetricValue(change.compareValue)}</span>
                            <span class="mx-2 text-gray-600">→</span>
                            <span class="text-white">\${formatMetricValue(change.baseValue)}</span>
                            <span class="\${trendClass} ml-2">(\${changeText})</span>
                        </div>
                    </div>
                \`;
            }).join('');
        }
        
        // 格式化指标值
        function formatMetricValue(value) {
            if (value === undefined || value === null) return '-';
            if (Math.abs(value) >= 1000) return value.toFixed(0);
            if (Math.abs(value) >= 100) return value.toFixed(1);
            return value.toFixed(2);
        }
        
        // 返回选择界面
        function backToCompareSelect() {
            document.getElementById('compareSelectSection').classList.remove('hidden');
            document.getElementById('compareResultSection').classList.add('hidden');
        }
        
        // ============ 分享功能 ============
        async function createShareLink() {
            if (!currentReportId) {
                alert('请等待分析完成后再分享');
                return;
            }
            
            try {
                const response = await fetch(\`/api/reports/\${currentReportId}/share\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeaders()
                    },
                    body: JSON.stringify({ expiresInDays: 30 }) // 30天有效期
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // 显示分享弹窗
                    showShareModal(data.shareUrl, data.shareCode);
                } else {
                    alert('创建分享链接失败: ' + data.error);
                }
            } catch (error) {
                console.error('Create share link error:', error);
                alert('创建分享链接失败，请稍后重试');
            }
        }
        
        function showShareModal(shareUrl, shareCode) {
            // 创建分享弹窗
            const modal = document.createElement('div');
            modal.id = 'shareModal';
            modal.className = 'modal';
            modal.style.display = 'flex';
            modal.innerHTML = \`
                <div class="modal-content rounded-xl p-6 max-w-md w-full mx-4">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold gold-gradient"><i class="fas fa-share-alt mr-2"></i>分享报告</h3>
                        <button onclick="closeShareModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                    </div>
                    
                    <div class="mb-6">
                        <div class="text-sm text-gray-400 mb-2">分享链接</div>
                        <div class="flex gap-2">
                            <input type="text" id="shareUrlInput" value="\${shareUrl}" readonly
                                class="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
                            <button onclick="copyShareUrl()" class="px-4 py-2 btn-gold rounded-lg">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <button onclick="shareToWeChat()" class="p-4 bg-green-600/20 border border-green-600/30 rounded-lg hover:bg-green-600/30 transition">
                            <i class="fab fa-weixin text-2xl text-green-400"></i>
                            <div class="text-xs text-gray-400 mt-2">微信</div>
                        </button>
                        <button onclick="shareToWeibo()" class="p-4 bg-red-600/20 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition">
                            <i class="fab fa-weibo text-2xl text-red-400"></i>
                            <div class="text-xs text-gray-400 mt-2">微博</div>
                        </button>
                        <button onclick="shareToQQ()" class="p-4 bg-blue-600/20 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition">
                            <i class="fab fa-qq text-2xl text-blue-400"></i>
                            <div class="text-xs text-gray-400 mt-2">QQ</div>
                        </button>
                    </div>
                    
                    <div class="text-center text-xs text-gray-500">
                        链接有效期30天 · 分享码: \${shareCode}
                    </div>
                </div>
            \`;
            document.body.appendChild(modal);
        }
        
        function closeShareModal() {
            const modal = document.getElementById('shareModal');
            if (modal) modal.remove();
        }
        
        function copyShareUrl() {
            const input = document.getElementById('shareUrlInput');
            input.select();
            document.execCommand('copy');
            
            // 显示提示
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-8 left-1/2 transform -translate-x-1/2 px-6 py-3 bg-green-500 text-white rounded-lg shadow-lg z-50';
            toast.textContent = '链接已复制到剪贴板';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }
        
        function shareToWeChat() {
            alert('请复制链接后在微信中分享');
            copyShareUrl();
        }
        
        function shareToWeibo() {
            const url = document.getElementById('shareUrlInput').value;
            const text = name + ' 财报分析报告 - Finspark';
            window.open(\`https://service.weibo.com/share/share.php?url=\${encodeURIComponent(url)}&title=\${encodeURIComponent(text)}\`, '_blank');
        }
        
        function shareToQQ() {
            const url = document.getElementById('shareUrlInput').value;
            const title = name + ' 财报分析报告';
            window.open(\`https://connect.qq.com/widget/shareqq/index.html?url=\${encodeURIComponent(url)}&title=\${encodeURIComponent(title)}&source=Finspark\`, '_blank');
        }
        
        // 强制重新分析（忽略缓存，使用最新模型重新生成）
        async function forceReanalyze() {
            if (!code) {
                alert('请先选择一只股票');
                return;
            }
            
            // 确认对话框
            if (!confirm('确定要重新分析吗？\\n\\n这将忽略历史缓存，使用最新模型重新生成完整报告。\\n预计需要1-2分钟。')) {
                return;
            }
            
            // 隐藏重新分析按钮，显示分析中状态
            document.getElementById('reanalyzeBtn').classList.add('hidden');
            document.getElementById('analysisStatus').innerHTML = \`
                <div class="text-sm text-gray-400">分析状态</div>
                <div class="text-lg text-blue-400 font-semibold">
                    <i class="fas fa-spinner fa-spin mr-1"></i>重新分析中
                </div>
                <div class="text-xs text-gray-500 mt-1">正在使用最新模型生成...</div>
            \`;
            
            // 重置进度条
            document.getElementById('progressBar').style.width = '0%';
            document.getElementById('progressPercent').textContent = '0%';
            document.getElementById('currentPhase').textContent = '启动重新分析';
            
            // 重置Agent状态
            document.querySelectorAll('.agent-item').forEach(item => {
                item.classList.remove('completed', 'processing');
            });
            
            // 重置增强模块状态
            document.getElementById('enhancedModulesSection').classList.add('hidden');
            updateIndustryComparisonAgentStatus('waiting');
            
            // 隐藏之前的分析结果
            document.getElementById('analysisResults').classList.add('hidden');
            
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                };
                
                const response = await fetch('/api/analyze/force-reanalyze', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        companyCode: code,
                        companyName: name,
                        reportType: 'annual',
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    currentReportId = data.reportId;
                    console.log('[Force Reanalyze] Started, reportId:', data.reportId);
                    
                    // 开始轮询新报告的进度
                    pollStatus(data.reportId);
                } else {
                    alert('重新分析启动失败: ' + data.error);
                    // 恢复重新分析按钮
                    document.getElementById('reanalyzeBtn').classList.remove('hidden');
                }
            } catch (error) {
                console.error('Force reanalyze error:', error);
                alert('重新分析出错，请稍后重试');
                document.getElementById('reanalyzeBtn').classList.remove('hidden');
            }
        }
        
        // 轮询状态
        async function pollStatus(reportId) {
            try {
                const response = await fetch(\`/api/analyze/result/\${reportId}\`);
                const data = await response.json();
                
                if (data.success) {
                    const report = data.report;
                    currentReport = report;
                    
                    // 更新进度
                    const progress = report.progress || {};
                    document.getElementById('currentPhase').textContent = progress.currentPhase || '处理中';
                    document.getElementById('progressPercent').textContent = (progress.percentage || 0) + '%';
                    document.getElementById('progressBar').style.width = (progress.percentage || 0) + '%';
                    
                    // 更新Agent状态
                    const agentItems = document.querySelectorAll('.agent-item');
                    const completedAgents = progress.completedAgents || [];
                    agentItems.forEach((item, index) => {
                        if (completedAgents.includes(agentNames[index])) {
                            item.classList.add('completed');
                            item.classList.remove('processing');
                        }
                    });
                    
                    // 检查是否完成
                    if (report.status === 'completed') {
                        document.getElementById('analysisStatus').innerHTML = \`
                            <div class="text-sm text-gray-400">分析状态</div>
                            <div class="text-lg text-green-500 font-semibold">已完成</div>
                        \`;
                        displayResults(report);
                        document.getElementById('favoriteBtn').classList.remove('hidden');
                        document.getElementById('favoriteBtnMobile')?.classList.remove('hidden');
                        // 显示分享按钮
                        document.getElementById('shareBtn').classList.remove('hidden');
                        document.getElementById('shareBtnMobile')?.classList.remove('hidden');
                        // 显示重新分析按钮，方便用户使用最新模型更新报告
                        document.getElementById('reanalyzeBtn').classList.remove('hidden');
                        // 显示历史对比按钮
                        document.getElementById('compareBtn').classList.remove('hidden');
                        
                        // 更新智能助手上下文
                        window.currentReportId = reportId;
                        window.hasAnalysisReport = true;
                        if (typeof setAssistantStockContext === 'function') {
                            setAssistantStockContext(code, name, true);
                        }
                    } else if (report.status === 'failed') {
                        document.getElementById('analysisStatus').innerHTML = \`
                            <div class="text-sm text-gray-400">分析状态</div>
                            <div class="text-lg text-red-500 font-semibold">失败</div>
                            <div class="text-xs text-gray-500 mt-1">点击"重新分析"重试</div>
                        \`;
                        // 显示重新分析按钮，让用户可以重试
                        document.getElementById('reanalyzeBtn').classList.remove('hidden');
                    } else {
                        // 继续轮询
                        setTimeout(() => pollStatus(reportId), 3000);
                    }
                }
            } catch (error) {
                console.error('Poll status error:', error);
                setTimeout(() => pollStatus(reportId), 5000);
            }
        }
        
        // 显示分析结果 - 支持深度分析的分层展示
        function displayResults(report) {
            document.getElementById('analysisResults').classList.remove('hidden');
            
            // 🆕 加载股票走势面板数据
            // 优先使用报告中的股票代码，其次使用URL参数中的code
            const stockCode = report.companyCode || code;
            if (stockCode && window.StockMarketPanel) {
                window.StockMarketPanel.loadData(stockCode, 90); // 默认3个月
            }
            
            const conclusion = report.finalConclusion || {};
            // 兼容新旧数据格式 - 增强版，遍历所有可能的数据路径
            const getScore = () => {
                return conclusion.summary?.score 
                    || conclusion.companyQuality?.score 
                    || conclusion.score
                    || 0;
            };
            
            const getRecommendation = () => {
                // 遍历所有可能的推荐字段
                return conclusion.summary?.recommendation 
                    || conclusion.recommendation?.action 
                    || conclusion.recommendation
                    || conclusion.summary?.oneSentence  // 如果没有明确推荐，使用一句话结论
                    || '';
            };
            
            const getSuitableInvestor = () => {
                return conclusion.summary?.suitableInvestorType 
                    || conclusion.recommendation?.suitableFor
                    || conclusion.recommendation?.targetInvestor 
                    || '';
            };
            
            const getValuation = () => {
                return conclusion.investmentValue?.valuationAssessment
                    || conclusion.valuation
                    || conclusion.summary?.targetPriceRange
                    || '';
            };
            
            // 投资建议摘要 - 增强版，从多个Agent提取数据填充缺失值
            const summaryContent = document.getElementById('summaryContent');
            
            // 智能提取投资建议（从多个来源）
            const getSmartRecommendation = () => {
                const rec = getRecommendation();
                if (rec && rec !== '--' && rec !== '') return rec;
                
                // 从风险评估推断
                const riskLevel = report.riskResult?.summary?.overallRisk || report.riskResult?.detailedAnalysis?.debtRisk?.level;
                const riskLevelLower = (riskLevel || '').toLowerCase();
                if (riskLevelLower.includes('安全') || riskLevelLower === '低') return '强烈推荐';
                if (riskLevelLower.includes('适中') || riskLevelLower === '中低' || riskLevelLower === '较低') return '买入';
                if (riskLevelLower === '中') return '持有';
                if (riskLevelLower.includes('高风险') || riskLevelLower === '中高' || riskLevelLower === '较高') return '谨慎';
                if (riskLevelLower === '高' || riskLevelLower.includes('危险')) return '回避';
                
                // 从评分推断
                const score = getScore();
                if (score >= 85) return '强烈推荐';
                if (score >= 75) return '买入';
                if (score >= 60) return '持有';
                if (score >= 45) return '观望';
                if (score > 0) return '谨慎';
                
                // 从盈利质量推断
                const earningsGrade = report.earningsQualityResult?.summary?.earningsGrade;
                if (earningsGrade === 'A') return '强烈推荐';
                if (earningsGrade === 'B') return '买入';
                if (earningsGrade === 'C') return '持有';
                
                return '待分析';
            };
            
            // 智能提取适合投资者（从多个来源）
            const getSmartInvestor = () => {
                const investor = getSuitableInvestor();
                if (investor && investor !== '--' && investor !== '') return investor;
                
                // 从综合数据推断
                const score = getScore();
                const riskLevel = report.riskResult?.summary?.overallRisk || '';
                const riskLevelLower = riskLevel.toLowerCase();
                const cashQuality = report.cashFlowResult?.summary?.cashQuality;
                const sustainability = report.profitabilityResult?.summary?.sustainability;
                
                // 高分+低风险+高质量现金流 = 稳健型
                if (score >= 80 && (riskLevelLower.includes('安全') || riskLevelLower.includes('低'))) {
                    return '稳健型';
                }
                // 高分+中等风险 = 价值型
                if (score >= 70 || sustainability === '高') {
                    return '价值型';
                }
                // 中等分数 = 平衡型
                if (score >= 55) {
                    return '平衡型';
                }
                // 高风险 = 激进型
                if (riskLevelLower.includes('高')) {
                    return '激进型';
                }
                
                return '价值型';
            };
            
            // 智能提取估值评估（从多个来源，结合PE/PB数据）
            const getSmartValuation = () => {
                const valuation = getValuation();
                if (valuation && valuation !== '--' && valuation !== '') return valuation;
                
                // 从投资价值分析推断
                const investmentValue = conclusion.investmentValue;
                if (investmentValue?.valuationAssessment) return investmentValue.valuationAssessment;
                if (investmentValue?.hasLongTermValue === true) return '具有长期价值';
                if (investmentValue?.hasLongTermValue === false) return '价值有限';
                
                // 从盈利能力和财务健康推断
                const profitability = report.profitabilityResult?.summary;
                const balance = report.balanceSheetResult?.summary;
                const financialHealth = balance?.financialHealth || '';
                const sustainability = profitability?.sustainability || '';
                
                if (financialHealth === '优秀' && sustainability === '高') return '低估';
                if (financialHealth === '优秀' || sustainability === '高') return '合理偏低';
                if (financialHealth === '良好' && sustainability === '中') return '合理';
                if (financialHealth === '一般' || sustainability === '低') return '偏高';
                
                // 从评分推断
                const score = getScore();
                if (score >= 85) return '低估';
                if (score >= 70) return '合理';
                if (score >= 55) return '适中';
                if (score > 0) return '偏高';
                
                return '待评估';
            };
            
            summaryContent.innerHTML = \`
                <div class="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 transition">
                    <div class="text-3xl font-bold \${getScoreColor(getScore())}">\${getScore() || '--'}</div>
                    <div class="text-xs text-gray-400 mt-1">综合评分</div>
                </div>
                <div class="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 transition">
                    <div class="text-lg font-semibold \${getActionColor(getSmartRecommendation())}">\${formatAction(getSmartRecommendation())}</div>
                    <div class="text-xs text-gray-400 mt-1">投资建议</div>
                </div>
                <div class="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 transition">
                    <div class="text-lg font-semibold text-blue-400">\${formatInvestor(getSmartInvestor())}</div>
                    <div class="text-xs text-gray-400 mt-1">适合投资者</div>
                </div>
                <div class="text-center p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-yellow-600/50 transition">
                    <div class="text-lg font-semibold text-purple-400">\${formatValuation(getSmartValuation())}</div>
                    <div class="text-xs text-gray-400 mt-1">估值评估</div>
                </div>
            \`;
            
            // ========== 商业模式与护城河分析 ==========
            displayBusinessModelAnalysis(report);
            
            // ========== 业务洞察（商业模式之后、财报数据之前） ==========
            displayBusinessInsight(report);
            
            // ========== 财报数据分析 ==========
            displayFinancialAnalysis(report);
            
            // ========== 风险评估 ==========
            displayRiskAnalysis(report);
            
            // ========== 业绩预测（风险评估之后、估值评估之前） ==========
            displayForecast(report);
            
            // ========== 估值评估（独立模块） ==========
            displayValuationAnalysis(report);
            
            // 关键要点 - 整合到投资摘要区域，更紧凑专业
            const keyTakeaways = conclusion.keyTakeaways || [];
            const keyTakeawaysList = document.getElementById('keyTakeawaysList');
            
            if (keyTakeaways.length > 0) {
                keyTakeawaysList.innerHTML = keyTakeaways.map((item, index) => 
                    \`<li class="flex items-start p-2 \${index % 2 === 0 ? 'bg-gray-800/30' : 'bg-gray-800/10'} rounded hover:bg-gray-700/30 transition">
                        <span class="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-center text-black text-xs font-bold mr-3 mt-0.5">\${index + 1}</span>
                        <span class="text-gray-300 text-sm">\${item}</span>
                    </li>\`
                ).join('');
            } else {
                // 如果没有关键要点，隐藏该区域
                document.getElementById('keyTakeawaysSection').classList.add('hidden');
            }
            
            // 添加投资价值详细评估（整合到摘要区域）
            const assessmentSection = document.getElementById('investmentAssessmentSection');
            if (conclusion.investmentValue?.assessment || conclusion.companyQuality?.assessment) {
                assessmentSection.classList.remove('hidden');
                assessmentSection.innerHTML = \`
                    <h3 class="text-md font-semibold text-purple-400 mb-3">
                        <i class="fas fa-chart-pie mr-2"></i>投资价值评估
                    </h3>
                    <p class="text-gray-300 text-sm mb-2">\${conclusion.investmentValue?.assessment || conclusion.companyQuality?.assessment || ''}</p>
                    \${conclusion.recommendation?.rationale ? \`
                    <p class="text-gray-400 text-sm italic">\${conclusion.recommendation.rationale}</p>
                    \` : ''}
                \`;
            }
            
            // 检查是否已有漫画
            console.log('[Comic] Checking comicStatus:', report.comicStatus, 'comicId:', report.comicId);
            if (report.comicStatus === 'completed') {
                console.log('[Comic] Loading existing comic...');
                loadComic();
            }
        }
        
        // ========== 商业模式与护城河分析显示函数 ==========
        function displayBusinessModelAnalysis(report) {
            const businessModel = report.businessModelResult || {};
            
            // 调试日志 - 检查数据是否正确传入
            console.log('[BusinessModel] Raw data:', JSON.stringify(businessModel).substring(0, 500));
            console.log('[BusinessModel] Has data:', Object.keys(businessModel).length > 0);
            
            // 安全地将对象转换为可显示的字符串（避免 [object Object]）
            const toStr = (val) => {
                if (val === null || val === undefined) return null;
                if (typeof val === 'string') return val;
                if (typeof val === 'number') return String(val);
                if (typeof val === 'object') {
                    // 优先提取常见的文本属性
                    if (val.level) return val.level;
                    if (val.summary) return val.summary;
                    if (val.description) return val.description;
                    if (val.name) return val.name;
                    if (val.type) return val.type;
                    if (val.value) return val.value;
                    if (Array.isArray(val)) return val.filter(v => typeof v === 'string').join('、') || null;
                    // 找第一个字符串值
                    for (const v of Object.values(val)) {
                        if (typeof v === 'string' && v.length > 2 && v.length < 200) return v;
                    }
                    return null;
                }
                return null;
            };
            
            // 适配新旧数据结构
            const coreModel = businessModel.coreModel || {};
            const competitiveAdvantage = businessModel.competitiveAdvantage || {};
            const cultureAnalysis = businessModel.cultureAnalysis || {};
            const sustainability = businessModel.sustainability || {};
            
            // 兼容旧结构
            const summary = businessModel.summary || {};
            const moatAnalysis = businessModel.moatAnalysis || {};
            const model = businessModel.businessModel || {};
            const culture = businessModel.cultureAndGovernance || {};
            
            // 护城河强度徽章 - 支持新旧数据结构
            const moatStrengthBadge = document.getElementById('moatStrengthBadge');
            const strengthColors = {
                '极强': 'bg-green-600 text-white',
                '强': 'bg-green-500 text-white',
                '中等': 'bg-yellow-500 text-black',
                '弱': 'bg-orange-500 text-white',
                '无': 'bg-red-500 text-white'
            };
            // 检查是否有有效的商业模式数据 - 新旧结构兼容
            const hasValidData = competitiveAdvantage.moatStrength || coreModel.type || summary.moatStrength || summary.oneSentence || moatAnalysis.primaryMoat?.type;
            const moatStrength = hasValidData ? (competitiveAdvantage.moatStrength || summary.moatStrength || '待分析') : '点击重新分析';
            const badgeClass = hasValidData ? (strengthColors[moatStrength] || 'bg-gray-600 text-white') : 'bg-orange-600/50 text-orange-300 cursor-pointer';
            moatStrengthBadge.className = \`px-4 py-1 rounded-full text-sm font-semibold \${badgeClass}\`;
            moatStrengthBadge.innerHTML = hasValidData ? \`<i class="fas fa-shield mr-1"></i>\${moatStrength}\` : \`<i class="fas fa-sync-alt mr-1"></i>\${moatStrength}\`;
            
            // 一句话核心结论 - 新结构使用 coreModel.description
            const oneSentenceEl = document.getElementById('moatOneSentence');
            const oneSentenceText = summary.oneSentence || coreModel.description;
            if (oneSentenceText) {
                oneSentenceEl.querySelector('p').textContent = oneSentenceText.substring(0, 150) + (oneSentenceText.length > 150 ? '...' : '');
                oneSentenceEl.classList.remove('hidden');
            } else {
                oneSentenceEl.classList.add('hidden');
            }
            
            // 护城河类型内容 - 适配新结构
            const moatTypeContent = document.getElementById('moatTypeContent');
            const primaryMoat = moatAnalysis.primaryMoat || {};
            const moatTypes = competitiveAdvantage.moatType || [];
            const moatTypeStr = Array.isArray(moatTypes) ? moatTypes.join('、') : (moatTypes || primaryMoat.type || summary.moatType || '--');
            // 安全获取描述文本
            const moatDesc = toStr(competitiveAdvantage.moatDescription) || '';
            const primaryMoatDesc = toStr(primaryMoat.description) || '';
            moatTypeContent.innerHTML = \`
                <div class="mb-2">
                    <span class="text-yellow-400 font-semibold">\${moatTypeStr}</span>
                </div>
                <div class="text-xs text-gray-400 mb-2">
                    <span>强度: </span>
                    <span class="text-yellow-300">\${competitiveAdvantage.moatStrength || primaryMoat.strength || summary.moatStrength || '--'}</span>
                    <span class="mx-2">|</span>
                    <span>持久性: </span>
                    <span class="text-yellow-300">\${sustainability.level || summary.moatDurability || '--'}</span>
                </div>
                \${moatDesc ? \`<p class="text-gray-400 text-xs line-clamp-3">\${moatDesc.substring(0, 150)}\${moatDesc.length > 150 ? '...' : ''}</p>\` : ''}
                \${primaryMoatDesc ? \`<p class="text-gray-400 text-xs line-clamp-3">\${primaryMoatDesc.substring(0, 120)}\${primaryMoatDesc.length > 120 ? '...' : ''}</p>\` : ''}
            \`;
            
            // 商业模式内容 - 适配新结构（使用 toStr 防止 [object Object]）
            const businessModelContent = document.getElementById('businessModelContent');
            const valueProposition = model.valueProposition || {};
            const revenueModel = model.revenueModel || {};
            const modelType = toStr(coreModel.type) || toStr(coreModel.businessType) || toStr(summary.modelType) || toStr(revenueModel.type) || '--';
            const pricingPower = toStr(competitiveAdvantage.pricingPower) || toStr(revenueModel.pricingPower) || '--';
            const scalability = toStr(sustainability.level) || toStr(model.scalability?.level) || toStr(coreModel.scalability) || '--';
            const synergy = toStr(competitiveAdvantage.synergy) || toStr(competitiveAdvantage.description);
            const valuePropCore = toStr(valueProposition.core) || toStr(coreModel.businessModelFeatures);
            businessModelContent.innerHTML = \`
                <div class="mb-2">
                    <span class="text-blue-300 font-semibold">\${modelType}</span>
                </div>
                <div class="text-xs text-gray-400 mb-2">
                    <span>定价权: </span>
                    <span class="text-blue-300">\${pricingPower}</span>
                    <span class="mx-2">|</span>
                    <span>可扩展: </span>
                    <span class="text-blue-300">\${scalability}</span>
                </div>
                \${synergy ? \`<p class="text-gray-400 text-xs font-medium mb-1">「\${synergy.substring(0, 80)}\${synergy.length > 80 ? '...' : ''}」</p>\` : ''}
                \${valuePropCore ? \`<p class="text-gray-400 text-xs font-medium mb-1">「\${valuePropCore.substring(0, 100)}\${valuePropCore.length > 100 ? '...' : ''}」</p>\` : ''}
            \`;
            
            // 企业文化内容 - 适配新结构
            const cultureContent = document.getElementById('cultureContent');
            const corpCulture = culture.corporateCulture || {};
            const management = culture.management || {};
            const governance = cultureAnalysis.governance || culture.governance || {};
            const cultureType = cultureAnalysis.type || corpCulture.type || '--';
            const governanceQuality = governance.quality || '--';
            // 安全获取企业文化描述
            const cultureDesc = toStr(cultureAnalysis.description) || '';
            const corpCultureDesc = toStr(corpCulture.description) || '';
            cultureContent.innerHTML = \`
                <div class="mb-2">
                    <span class="text-green-300 font-semibold">\${cultureType}</span>
                    \${summary.cultureScore ? \`<span class="ml-2 text-xs px-2 py-0.5 rounded bg-green-800 text-green-200">评分: \${summary.cultureScore}</span>\` : ''}
                </div>
                <div class="text-xs text-gray-400 mb-2">
                    <span>治理质量: </span>
                    <span class="text-green-300">\${governanceQuality}</span>
                    <span class="mx-2">|</span>
                    <span>利益一致: </span>
                    <span class="text-green-300">\${management.alignment || (governance.highlights ? '良好' : '--')}</span>
                </div>
                \${cultureDesc ? \`<p class="text-gray-400 text-xs line-clamp-2">\${cultureDesc.substring(0, 100)}\${cultureDesc.length > 100 ? '...' : ''}</p>\` : ''}
                \${corpCultureDesc ? \`<p class="text-gray-400 text-xs line-clamp-2">\${corpCultureDesc.substring(0, 100)}\${corpCultureDesc.length > 100 ? '...' : ''}</p>\` : ''}
            \`;
            
            // 详细解读内容 - 适配新旧数据结构
            const detailedContent = document.getElementById('moatDetailedContent');
            let detailHtml = '';
            
            // 护城河详细分析 - 新结构使用 competitiveAdvantage
            // 注意：primaryMoat 已在上方声明，这里直接复用
            const evidence = competitiveAdvantage.evidence || primaryMoat.evidence || [];
            if (moatDesc || primaryMoatDesc || moatAnalysis.moatConclusion) {
                detailHtml += \`
                <div class="bg-yellow-900/10 p-4 rounded-lg border border-yellow-800/30">
                    <h4 class="font-semibold text-yellow-400 mb-3 flex items-center">
                        <i class="fas fa-shield-alt mr-2"></i>护城河深度分析
                    </h4>
                    \${moatDesc ? \`<p class="text-gray-300 text-sm mb-3">\${moatDesc}</p>\` : ''}
                    \${primaryMoatDesc ? \`<p class="text-gray-300 text-sm mb-3">\${primaryMoatDesc}</p>\` : ''}
                    \${evidence.length > 0 ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-2">支撑证据:</div>
                        <ul class="space-y-1">
                            \${evidence.map(e => \`<li class="text-sm text-gray-400 flex items-start"><i class="fas fa-check text-green-500 mr-2 mt-1 text-xs"></i>\${e}</li>\`).join('')}
                        </ul>
                    </div>
                    \` : ''}
                    \${moatAnalysis.secondaryMoats && moatAnalysis.secondaryMoats.length > 0 ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-2">次要护城河:</div>
                        <div class="flex flex-wrap gap-2">
                            \${moatAnalysis.secondaryMoats.map(m => \`<span class="px-2 py-1 text-xs bg-yellow-800/30 text-yellow-300 rounded">\${m.type}: \${m.strength}</span>\`).join('')}
                        </div>
                    </div>
                    \` : ''}
                    \${moatAnalysis.moatThreats && moatAnalysis.moatThreats.length > 0 ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-2">护城河威胁:</div>
                        <ul class="space-y-1">
                            \${moatAnalysis.moatThreats.map(t => \`<li class="text-sm text-orange-300 flex items-start"><i class="fas fa-exclamation-triangle mr-2 mt-1 text-xs"></i>\${t}</li>\`).join('')}
                        </ul>
                    </div>
                    \` : ''}
                    \${competitiveAdvantage.synergy ? \`
                    <div class="mt-3 p-3 bg-gray-800/50 rounded border-l-2 border-yellow-500">
                        <p class="text-sm text-gray-300 italic">\${competitiveAdvantage.synergy}</p>
                    </div>
                    \` : ''}
                    \${moatAnalysis.moatConclusion ? \`
                    <div class="mt-3 p-3 bg-gray-800/50 rounded border-l-2 border-yellow-500">
                        <p class="text-sm text-gray-300 italic">\${moatAnalysis.moatConclusion}</p>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            // 商业模式详细分析 - 适配新结构 coreModel
            // 注意：valueProposition 和 revenueModel 已在上方声明，这里直接复用
            const revenueBreakdown = coreModel.revenueBreakdown || {};
            if (coreModel.description || valueProposition.description || revenueModel.description || sustainability.description) {
                detailHtml += \`
                <div class="bg-blue-900/10 p-4 rounded-lg border border-blue-800/30">
                    <h4 class="font-semibold text-blue-400 mb-3 flex items-center">
                        <i class="fas fa-sitemap mr-2"></i>商业模式深度分析
                    </h4>
                    \${coreModel.description ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-1">商业模式概述</div>
                        <p class="text-gray-300 text-sm">\${coreModel.description}</p>
                    </div>
                    \` : ''}
                    \${Object.keys(revenueBreakdown).length > 0 ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-2">收入结构分解</div>
                        <div class="grid grid-cols-2 gap-2">
                            \${Object.entries(revenueBreakdown).map(([key, val]) => \`
                            <div class="p-2 bg-gray-800/50 rounded">
                                <div class="text-xs text-blue-300 font-medium">\${val.income ? val.income + '亿' : ''} \${key}</div>
                                <div class="text-xs text-gray-500">毛利率: \${val.margin || '--'} | 占比: \${val.share || '--'}</div>
                            </div>
                            \`).join('')}
                        </div>
                    </div>
                    \` : ''}
                    \${valueProposition.description ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-1">价值主张</div>
                        <p class="text-gray-300 text-sm">\${valueProposition.description}</p>
                    </div>
                    \` : ''}
                    \${sustainability.description ? \`
                    <div class="p-3 bg-gray-800/50 rounded border-l-2 border-blue-500">
                        <div class="text-xs text-gray-500 mb-1">可持续性: \${sustainability.level || '--'}</div>
                        <p class="text-sm text-gray-300">\${sustainability.description}</p>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            // 企业文化详细分析 - 适配新结构 cultureAnalysis
            // 注意：corpCulture 和 management 已在上方声明，这里直接复用
            const cultureStrengths = cultureAnalysis.strengths || corpCulture.strengths || [];
            const cultureConcerns = cultureAnalysis.concerns || corpCulture.concerns || [];
            if (cultureAnalysis.description || corpCulture.description || governance.highlights) {
                detailHtml += \`
                <div class="bg-green-900/10 p-4 rounded-lg border border-green-800/30">
                    <h4 class="font-semibold text-green-400 mb-3 flex items-center">
                        <i class="fas fa-users mr-2"></i>企业文化与治理深度分析
                    </h4>
                    \${cultureAnalysis.description ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-1">企业文化</div>
                        <p class="text-gray-300 text-sm">\${cultureAnalysis.description}</p>
                    </div>
                    \` : ''}
                    \${corpCulture.description ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-1">企业文化</div>
                        <p class="text-gray-300 text-sm">\${corpCulture.description}</p>
                    </div>
                    \` : ''}
                    \${cultureStrengths.length > 0 ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-1">文化优势</div>
                        <div class="flex flex-wrap gap-1">
                            \${cultureStrengths.map(s => \`<span class="px-2 py-0.5 text-xs bg-green-800/30 text-green-300 rounded">\${s}</span>\`).join('')}
                        </div>
                    </div>
                    \` : ''}
                    \${governance.highlights && governance.highlights.length > 0 ? \`
                    <div class="mb-3">
                        <div class="text-xs text-gray-500 mb-1">治理亮点</div>
                        <ul class="space-y-1">
                            \${governance.highlights.map(h => \`<li class="text-sm text-green-300 flex items-start"><i class="fas fa-star text-green-500 mr-2 mt-1 text-xs"></i>\${h}</li>\`).join('')}
                        </ul>
                    </div>
                    \` : ''}
                    \${cultureConcerns.length > 0 || (governance.concerns && governance.concerns.length > 0) ? \`
                    <div class="p-3 bg-red-900/20 rounded border-l-2 border-red-500">
                        <div class="text-xs text-red-400 mb-1">潜在隐患</div>
                        <ul class="space-y-1">
                            \${cultureConcerns.concat(governance.concerns || []).map(c => \`<li class="text-sm text-gray-400">\${c}</li>\`).join('')}
                        </ul>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            detailedContent.innerHTML = detailHtml || '<p class="text-gray-500 text-sm">暂无详细分析数据</p>';
            
            // 投资含义 - 从sustainability或competitiveAdvantage中提取
            const investmentImplEl = document.getElementById('investmentImplication');
            const investmentImpl = businessModel.investmentImplication || sustainability.investmentImplication || {};
            if (investmentImpl.moatPremium || investmentImpl.longTermHolding || (investmentImpl.keyMonitoringPoints && investmentImpl.keyMonitoringPoints.length > 0)) {
                investmentImplEl.innerHTML = \`
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex items-center gap-4 text-sm">
                            \${investmentImpl.moatPremium ? \`
                            <span class="flex items-center">
                                <i class="fas fa-gem text-yellow-400 mr-1"></i>
                                <span class="text-gray-400">支撑溢价:</span>
                                <span class="\${investmentImpl.moatPremium === '是' ? 'text-green-400' : 'text-red-400'} ml-1">\${investmentImpl.moatPremium}</span>
                            </span>
                            \` : ''}
                            \${investmentImpl.longTermHolding ? \`
                            <span class="flex items-center">
                                <i class="fas fa-hourglass-half text-blue-400 mr-1"></i>
                                <span class="text-gray-400">长期持有:</span>
                                <span class="text-blue-300 ml-1">\${investmentImpl.longTermHolding}</span>
                            </span>
                            \` : ''}
                        </div>
                        \${investmentImpl.keyMonitoringPoints && investmentImpl.keyMonitoringPoints.length > 0 ? \`
                        <div class="text-xs text-gray-500">
                            <i class="fas fa-eye mr-1"></i>关注: \${investmentImpl.keyMonitoringPoints.slice(0, 2).join('、')}
                        </div>
                        \` : ''}
                    </div>
                \`;
                investmentImplEl.classList.remove('hidden');
            } else {
                investmentImplEl.classList.add('hidden');
            }
        }
        
        // ========== ECharts图表全局变量和函数 ==========
        let mainChart = null;
        let incomeChart = null;
        let currentChartData = null;
        let currentChartType = 'netProfit';
        let currentIncomeChartType = 'incomeNetProfit';
        let currentPeriodFilter = 'all';
        let currentChartDepth = 12;  // 默认显示12期
        let currentTrendInterpretations = null;  // 趋势解读数据缓存
        
        // 图表配置映射
        const chartConfigMap = {
            netProfit: { 
                label: '归母净利润', 
                field: 'n_income_attr_p', 
                yoyField: 'netprofit_yoy',
                unit: '亿', 
                divisor: 100000000,
                color: '#3b82f6',
                formatter: (v) => (v / 100000000).toFixed(2) + '亿'
            },
            revenue: { 
                label: '营业收入', 
                field: 'total_revenue', 
                yoyField: 'or_yoy',
                unit: '亿', 
                divisor: 100000000,
                color: '#10b981',
                formatter: (v) => (v / 100000000).toFixed(2) + '亿'
            },
            operatingProfit: { 
                label: '营业利润', 
                field: 'operate_profit', 
                yoyField: null,
                unit: '亿', 
                divisor: 100000000,
                color: '#a855f7',
                formatter: (v) => (v / 100000000).toFixed(2) + '亿'
            },
            eps: { 
                label: '每股收益', 
                field: 'basic_eps', 
                yoyField: null,
                unit: '元', 
                divisor: 1,
                color: '#8b5cf6',
                formatter: (v) => v?.toFixed(2) + '元'
            },
            grossMargin: { 
                label: '毛利率', 
                field: 'gross_margin', 
                yoyField: null,
                unit: '%', 
                divisor: 1,
                color: '#f59e0b',
                isPercentage: true,
                formatter: (v) => v?.toFixed(2) + '%'
            },
            netMargin: { 
                label: '净利率', 
                field: 'netprofit_margin', 
                yoyField: null,
                unit: '%', 
                divisor: 1,
                color: '#ec4899',
                isPercentage: true,
                formatter: (v) => v?.toFixed(2) + '%'
            },
            roe: { 
                label: 'ROE', 
                field: 'roe', 
                yoyField: null,
                unit: '%', 
                divisor: 1,
                color: '#06b6d4',
                isPercentage: true,
                formatter: (v) => v?.toFixed(2) + '%'
            },
            debtRatio: { 
                label: '资产负债率', 
                field: 'debt_to_assets', 
                yoyField: null,
                unit: '%', 
                divisor: 1,
                color: '#ef4444',
                isPercentage: true,
                formatter: (v) => v?.toFixed(2) + '%'
            }
        };
        
        // 格式化报告期显示
        function formatPeriod(endDate) {
            if (!endDate) return '--';
            const year = endDate.substring(0, 4);
            const month = endDate.substring(4, 6);
            if (month === '12' || month === '03' && endDate.substring(6, 8) === '31') {
                return year + '年报';
            } else if (month === '06') {
                return year + '中报';
            } else if (month === '03') {
                return year + '一季报';
            } else if (month === '09') {
                return year + '三季报';
            }
            return year + '.' + month;
        }
        
        // 过滤报告期
        function filterByPeriod(data, filter) {
            if (filter === 'all') return data;
            return data.filter(item => {
                const month = item.end_date?.substring(4, 6);
                if (filter === 'annual') return month === '12';
                if (filter === 'semi') return month === '06';
                return true;
            });
        }
        
        // 计算同比增长率
        function calculateYoY(data, field) {
            const result = [];
            for (let i = 0; i < data.length; i++) {
                const current = data[i][field];
                // 找到去年同期数据
                const currentPeriod = data[i].end_date;
                if (!currentPeriod) {
                    result.push(null);
                    continue;
                }
                const lastYearPeriod = (parseInt(currentPeriod.substring(0, 4)) - 1) + currentPeriod.substring(4);
                const lastYearData = data.find(d => d.end_date === lastYearPeriod);
                
                if (lastYearData && lastYearData[field] && lastYearData[field] !== 0) {
                    const yoy = ((current - lastYearData[field]) / Math.abs(lastYearData[field])) * 100;
                    result.push(parseFloat(yoy.toFixed(2)));
                } else {
                    result.push(null);
                }
            }
            return result;
        }
        
        // 初始化主图表
        function initMainChart(chartData) {
            if (!chartData) {
                console.warn('[Chart] No chart data provided');
                return;
            }
            currentChartData = chartData;
            
            const chartDom = document.getElementById('mainFinancialChart');
            if (!chartDom) {
                console.warn('[Chart] Main chart container not found');
                return;
            }
            
            // 检查 ECharts 是否加载
            if (typeof echarts === 'undefined') {
                console.error('[Chart] ECharts library not loaded');
                chartDom.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-exclamation-triangle mr-2"></i>图表库加载失败</div>';
                return;
            }
            
            try {
                if (mainChart) {
                    mainChart.dispose();
                }
                mainChart = echarts.init(chartDom, 'dark');
                console.log('[Chart] Main chart initialized');
                updateMainChart();
            } catch (error) {
                console.error('[Chart] Failed to initialize main chart:', error);
                chartDom.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-exclamation-triangle mr-2"></i>图表初始化失败</div>';
            }
        }
        
        // 更新主图表
        function updateMainChart() {
            if (!mainChart || !currentChartData) return;
            
            const config = chartConfigMap[currentChartType];
            if (!config) return;
            
            // 合并income和finaIndicator数据
            let mergedData = [];
            const income = currentChartData.income || [];
            const fina = currentChartData.finaIndicator || [];
            
            // 按end_date合并数据
            const dataMap = new Map();
            
            income.forEach(item => {
                if (item.end_date) {
                    dataMap.set(item.end_date, { ...item });
                }
            });
            
            fina.forEach(item => {
                if (item.end_date) {
                    const existing = dataMap.get(item.end_date) || {};
                    dataMap.set(item.end_date, { ...existing, ...item });
                }
            });
            
            mergedData = Array.from(dataMap.values())
                .sort((a, b) => a.end_date?.localeCompare(b.end_date) || 0);
            
            // 应用期间过滤
            mergedData = filterByPeriod(mergedData, currentPeriodFilter);
            
            // 根据用户选择的深度限制显示期数（12期 或 20期长期趋势）
            if (mergedData.length > currentChartDepth) {
                mergedData = mergedData.slice(-currentChartDepth);
            }
            
            // 准备数据
            const periods = mergedData.map(d => formatPeriod(d.end_date));
            const values = mergedData.map(d => {
                const val = d[config.field];
                if (val === null || val === undefined) return null;
                return config.isPercentage ? val : val / config.divisor;
            });
            
            // 计算或获取同比数据
            let yoyValues = [];
            if (config.yoyField) {
                yoyValues = mergedData.map(d => d[config.yoyField] || null);
            } else {
                // 手动计算同比
                yoyValues = calculateYoY(mergedData, config.field);
            }
            
            // 更新图例标签
            document.getElementById('chartValueLabel').textContent = config.label;
            document.getElementById('chartLatestPeriod').textContent = periods[periods.length - 1] || '--';
            
            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(20, 20, 40, 0.95)',
                    borderColor: 'rgba(212, 175, 55, 0.3)',
                    borderWidth: 1,
                    textStyle: { color: '#fff', fontSize: 12 },
                    axisPointer: {
                        type: 'cross',
                        crossStyle: { color: '#999' }
                    },
                    formatter: function(params) {
                        let html = '<div style="font-weight:600;margin-bottom:8px;color:#d4af37;">' + params[0].axisValue + '</div>';
                        params.forEach(p => {
                            const marker = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + p.color + ';margin-right:6px;"></span>';
                            let value = p.value;
                            if (p.seriesName === config.label) {
                                value = config.isPercentage ? value?.toFixed(2) + '%' : value?.toFixed(2) + config.unit;
                            } else {
                                value = value?.toFixed(2) + '%';
                            }
                            html += '<div style="margin:4px 0;">' + marker + p.seriesName + ': <span style="font-weight:600;color:' + (p.value >= 0 || p.seriesName === config.label ? p.color : '#ef4444') + '">' + (value || '--') + '</span></div>';
                        });
                        return html;
                    }
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    top: '10%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: periods,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisTick: { show: false },
                    axisLabel: { 
                        color: '#9ca3af', 
                        fontSize: 11,
                        rotate: periods.length > 8 ? 30 : 0
                    }
                },
                yAxis: [
                    {
                        type: 'value',
                        name: config.label + (config.isPercentage ? '(%)' : '(' + config.unit + ')'),
                        nameTextStyle: { color: '#9ca3af', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { lineStyle: { color: '#1f2937', type: 'dashed' } },
                        axisLabel: { 
                            color: '#9ca3af', 
                            fontSize: 11,
                            formatter: config.isPercentage ? '{value}%' : '{value}'
                        }
                    },
                    {
                        type: 'value',
                        name: '同比(%)',
                        nameTextStyle: { color: '#9ca3af', fontSize: 11 },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { show: false },
                        axisLabel: { 
                            color: '#9ca3af', 
                            fontSize: 11,
                            formatter: '{value}%'
                        }
                    }
                ],
                series: [
                    {
                        name: config.label,
                        type: 'bar',
                        data: values,
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: config.color },
                                { offset: 1, color: config.color + '80' }
                            ]),
                            borderRadius: [4, 4, 0, 0]
                        },
                        barMaxWidth: 40,
                        label: {
                            show: values.length <= 8,
                            position: 'top',
                            color: '#9ca3af',
                            fontSize: 10,
                            formatter: (p) => config.isPercentage ? p.value?.toFixed(1) + '%' : p.value?.toFixed(1)
                        }
                    },
                    {
                        name: '同比',
                        type: 'line',
                        yAxisIndex: 1,
                        data: yoyValues,
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 6,
                        lineStyle: { color: '#f97316', width: 2 },
                        itemStyle: { 
                            color: '#f97316',
                            borderColor: '#fff',
                            borderWidth: 1
                        },
                        label: {
                            show: values.length <= 6,
                            position: 'top',
                            color: '#f97316',
                            fontSize: 10,
                            formatter: (p) => (p.value >= 0 ? '+' : '') + p.value?.toFixed(1) + '%'
                        }
                    }
                ]
            };
            
            mainChart.setOption(option, true);
        }
        
        // 切换图表Tab
        function switchChartTab(chartType, btnElement) {
            currentChartType = chartType;
            
            // 更新Tab样式
            document.querySelectorAll('[data-chart]').forEach(btn => {
                if (btn.closest('#financialChartsSection')) {
                    btn.classList.remove('active');
                }
            });
            btnElement.classList.add('active');
            
            updateMainChart();
            updateTrendInterpretationPanel(chartType);  // 更新趋势解读面板
        }
        
        // 更新报告期筛选
        function updateChartPeriod(period) {
            currentPeriodFilter = period;
            updateMainChart();
            updateIncomeChart();
        }
        
        // 更新图表数据深度（12期 vs 20期长期趋势）
        function updateChartDepth(depth) {
            currentChartDepth = parseInt(depth);
            updateMainChart();
            updateIncomeChart();
        }
        
        // ========== 趋势解读面板相关函数 ==========
        
        // 更新趋势解读面板（整合方案A+B+C）
        function updateTrendInterpretationPanel(chartType) {
            const config = chartConfigMap[chartType];
            if (!config) return;
            
            // 更新标题
            document.getElementById('interpretationTitle').textContent = config.label + '趋势解读';
            
            // 1. 获取 AI 返回的数据
            let interpretation = currentTrendInterpretations?.[chartType] || {};
            
            // 2. 方案C: 从图表数据计算补充缺失字段
            const calculated = calculateMetricsFromChartData(chartType);
            
            // 3. 合并数据：计算值作为基础，AI 返回值优先
            if (calculated) {
                // 对于缺失或无效的字段，使用计算值补充
                if (!interpretation.latestValue || interpretation.latestValue === '--') {
                    interpretation.latestValue = calculated.latestValue;
                }
                if (!interpretation.latestPeriod || interpretation.latestPeriod === '--') {
                    interpretation.latestPeriod = calculated.latestPeriod;
                }
                if (!interpretation.yoyChange || interpretation.yoyChange === '--') {
                    interpretation.yoyChange = calculated.yoyChange;
                    interpretation.yoyDirection = calculated.yoyDirection;
                }
                if (!interpretation.trend) {
                    interpretation.trend = calculated.trend;
                }
                if (!interpretation.trendLabel || interpretation.trendLabel === '--') {
                    interpretation.trendLabel = calculated.trendLabel;
                }
                if (!interpretation.trendPeriods) {
                    interpretation.trendPeriods = calculated.trendPeriods;
                }
                if (!interpretation.peakInfo && calculated.peakInfo) {
                    interpretation.peakInfo = calculated.peakInfo;
                }
            }
            
            // 如果完全没有数据，显示空状态
            if (!interpretation.latestValue && !interpretation.insight && !calculated) {
                showInterpretationEmpty();
                return;
            }
            
            // 4. 更新数据概览
            document.getElementById('interpretationLatestValue').textContent = interpretation.latestValue || '--';
            
            const yoyEl = document.getElementById('interpretationYoyChange');
            const yoyValue = interpretation.yoyChange || '--';
            yoyEl.textContent = yoyValue;
            // 根据同比方向设置颜色
            if (interpretation.yoyDirection === 'up') {
                yoyEl.className = 'text-xl font-bold text-green-400';
            } else if (interpretation.yoyDirection === 'down') {
                yoyEl.className = 'text-xl font-bold text-red-400';
            } else {
                yoyEl.className = 'text-xl font-bold text-gray-400';
            }
            
            // 5. 更新趋势判断
            const trendBadge = document.getElementById('interpretationTrendBadge');
            const trendLabel = interpretation.trendLabel || '波动';
            trendBadge.textContent = trendLabel;
            // 根据趋势设置标签样式
            if (interpretation.trend === 'up') {
                trendBadge.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400';
            } else if (interpretation.trend === 'down') {
                trendBadge.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400';
            } else {
                trendBadge.className = 'px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/20 text-gray-400';
            }
            
            // 6. 趋势描述
            const trendDesc = [interpretation.trendPeriods, interpretation.peakInfo].filter(Boolean).join('。');
            document.getElementById('interpretationTrendDesc').textContent = trendDesc || (calculated ? calculated.trendPeriods : '--');
            
            // 7. 深度洞察
            const insightText = interpretation.insight || '暂无深度洞察，请查看图表数据了解趋势变化。';
            document.getElementById('interpretationInsight').textContent = insightText;
            
            // 8. 方案B: 关注点 - 确保与 insight 不重复
            let concernsText = interpretation.concerns;
            
            // 检查是否需要生成 fallback
            const needsFallback = !concernsText 
                || concernsText === '暂无特别关注点' 
                || concernsText === '详见完整分析报告'
                || concernsText === insightText  // 与 insight 完全相同
                || (insightText && concernsText && insightText.includes(concernsText.substring(0, 30)));  // insight 包含 concerns
            
            if (needsFallback) {
                concernsText = generateConcernsFallback(insightText, chartType, calculated);
            }
            
            document.getElementById('interpretationConcerns').textContent = concernsText;
        }
        
        // 显示加载状态
        function showInterpretationLoading() {
            document.getElementById('interpretationLatestValue').textContent = '--';
            document.getElementById('interpretationYoyChange').textContent = '--';
            document.getElementById('interpretationTrendBadge').textContent = '分析中';
            document.getElementById('interpretationTrendBadge').className = 'px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-400 animate-pulse';
            document.getElementById('interpretationTrendDesc').textContent = '正在生成趋势解读...';
            document.getElementById('interpretationInsight').textContent = '正在分析财务数据，请稍候...';
            document.getElementById('interpretationConcerns').textContent = '正在识别潜在风险和关注点...';
        }
        
        // 显示空状态
        function showInterpretationEmpty() {
            document.getElementById('interpretationLatestValue').textContent = '--';
            document.getElementById('interpretationYoyChange').textContent = '--';
            document.getElementById('interpretationTrendBadge').textContent = '暂无';
            document.getElementById('interpretationTrendBadge').className = 'px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/20 text-gray-400';
            document.getElementById('interpretationTrendDesc').textContent = '暂无趋势数据';
            document.getElementById('interpretationInsight').textContent = '暂无深度洞察';
            document.getElementById('interpretationConcerns').textContent = '当前暂无该指标的解读数据，请尝试分析其他企业。';
        }
        
        // ========== 方案C: 从图表数据计算指标 ==========
        
        // 从图表数据计算同比和趋势（当 AI 返回数据缺失时使用）
        function calculateMetricsFromChartData(chartType) {
            if (!currentChartData) return null;
            
            const config = chartConfigMap[chartType];
            if (!config) return null;
            
            const income = currentChartData.income || [];
            const fina = currentChartData.finaIndicator || [];
            
            // 合并数据并按日期排序
            const dataMap = new Map();
            income.forEach(item => {
                if (item.end_date) {
                    dataMap.set(item.end_date, { ...dataMap.get(item.end_date), ...item });
                }
            });
            fina.forEach(item => {
                if (item.end_date) {
                    dataMap.set(item.end_date, { ...dataMap.get(item.end_date), ...item });
                }
            });
            
            const sorted = Array.from(dataMap.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .slice(-12);  // 取最近12期
            
            if (sorted.length < 2) return null;
            
            const latest = sorted[sorted.length - 1];
            const latestPeriod = latest[0];
            const latestData = latest[1];
            const latestValue = latestData[config.field];
            
            if (latestValue === undefined || latestValue === null) return null;
            
            // 格式化最新值
            let formattedLatestValue;
            if (config.isPercentage) {
                formattedLatestValue = latestValue?.toFixed(2) + '%';
            } else if (config.divisor > 1) {
                formattedLatestValue = (latestValue / config.divisor).toFixed(2) + config.unit;
            } else {
                formattedLatestValue = latestValue?.toFixed(2) + config.unit;
            }
            
            // 计算同比：找去年同期
            const yoyPeriod = (parseInt(latestPeriod) - 10000).toString();
            const yoyEntry = sorted.find(([period]) => period === yoyPeriod);
            
            let yoyChange = '--';
            let yoyDirection = 'flat';
            if (yoyEntry) {
                const yoyValue = yoyEntry[1][config.field];
                if (yoyValue !== undefined && yoyValue !== null && yoyValue !== 0) {
                    const change = ((latestValue - yoyValue) / Math.abs(yoyValue)) * 100;
                    yoyChange = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
                    yoyDirection = change > 1 ? 'up' : (change < -1 ? 'down' : 'flat');
                }
            }
            
            // 计算趋势：分析近4期
            const recent4 = sorted.slice(-4);
            let upCount = 0, downCount = 0;
            for (let i = 1; i < recent4.length; i++) {
                const prevVal = recent4[i-1][1][config.field];
                const currVal = recent4[i][1][config.field];
                if (currVal !== undefined && prevVal !== undefined) {
                    if (currVal > prevVal) upCount++;
                    else if (currVal < prevVal) downCount++;
                }
            }
            
            let trend = 'flat', trendLabel = '波动';
            if (upCount >= 2 && upCount > downCount) {
                trend = 'up'; trendLabel = '上升';
            } else if (downCount >= 2 && downCount > upCount) {
                trend = 'down'; trendLabel = '下降';
            } else if (upCount === downCount && upCount > 0) {
                trend = 'flat'; trendLabel = '波动';
            } else {
                trend = 'flat'; trendLabel = '持平';
            }
            
            // 找峰值
            let peakValue = latestValue, peakPeriod = latestPeriod;
            sorted.forEach(([period, data]) => {
                const val = data[config.field];
                if (val !== undefined && val > peakValue) {
                    peakValue = val;
                    peakPeriod = period;
                }
            });
            
            let peakInfo = '';
            if (peakPeriod !== latestPeriod) {
                const peakFormatted = config.isPercentage 
                    ? peakValue?.toFixed(2) + '%'
                    : (config.divisor > 1 ? (peakValue / config.divisor).toFixed(2) + config.unit : peakValue?.toFixed(2) + config.unit);
                peakInfo = \`峰值出现在\${formatPeriod(peakPeriod)}，达\${peakFormatted}\`;
            }
            
            return {
                latestValue: formattedLatestValue,
                latestPeriod: formatPeriod(latestPeriod),
                yoyChange,
                yoyDirection,
                trend,
                trendLabel,
                trendPeriods: \`近\${sorted.length}期数据，最近4期\${trendLabel}趋势\`,
                peakInfo,
                _calculated: true  // 标记为计算值
            };
        }
        
        // ========== 方案B: 生成差异化的关注点 ==========
        
        // 各指标的通用关注点模板
        const metricConcernsTemplates = {
            netProfit: '需关注净利润增速变化及非经常性损益影响，警惕业绩波动风险。',
            revenue: '建议跟踪营收增速与行业平均水平的对比，关注市场份额变化。',
            eps: '关注每股收益的可持续性及股本变动影响，警惕摊薄风险。',
            grossMargin: '需警惕原材料成本波动对毛利率的影响，关注产品结构变化。',
            netMargin: '关注费用率变化对净利率的侵蚀风险，警惕盈利质量下降。',
            roe: '建议分析ROE变化的杜邦分解驱动因素，关注资本效率。',
            debtRatio: '需关注偿债能力指标及债务期限结构，警惕财务风险累积。',
            operatingProfit: '关注主营业务盈利能力的稳定性，警惕非主营业务占比变化。'
        };
        
        // 生成差异化的关注点（避免与 insight 重复）
        function generateConcernsFallback(insight, metricKey, calculated) {
            if (!insight) {
                return metricConcernsTemplates[metricKey] || '建议持续跟踪该指标，结合行业趋势综合判断。';
            }
            
            // 1. 优先提取风险相关句子
            const riskKeywords = ['风险', '警惕', '关注', '注意', '压力', '挑战', '下滑', '承压', '下降', '回落', '收窄'];
            const sentences = insight.split(/[。！？]/).filter(s => s.trim().length > 10);
            
            // 找到包含风险关键词的句子
            const riskSentences = sentences.filter(s => 
                riskKeywords.some(k => s.includes(k))
            );
            
            if (riskSentences.length > 0) {
                // 取第一个风险句，但不能与 insight 开头相同
                const riskText = riskSentences[0] + '。';
                if (!insight.startsWith(riskText.substring(0, 20))) {
                    return riskText;
                }
            }
            
            // 2. 根据计算出的趋势生成关注点
            if (calculated) {
                if (calculated.trend === 'down') {
                    return \`该指标近期呈下降趋势，同比\${calculated.yoyChange}，建议重点关注变化原因及后续走势。\`;
                } else if (calculated.trend === 'up' && calculated.yoyDirection === 'down') {
                    return \`虽然整体趋势向上，但同比出现\${calculated.yoyChange}的变化，需关注增速放缓风险。\`;
                }
            }
            
            // 3. 使用指标特定的通用关注点
            return metricConcernsTemplates[metricKey] || '建议持续跟踪该指标变化，结合行业趋势和公司战略综合判断。';
        }
        
        // 初始化趋势解读数据
        function initTrendInterpretations(interpretations) {
            currentTrendInterpretations = interpretations;
            // 更新当前选中指标的解读
            updateTrendInterpretationPanel(currentChartType);
        }
        
        // 按需加载趋势解读（针对旧缓存报告）
        async function loadTrendInterpretation(companyCode) {
            console.log('[TrendInterpretation] 开始按需加载:', companyCode);
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
                
                const response = await fetch(\`/api/analyze/trend-interpretation/\${companyCode}\`, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(\`HTTP \${response.status}\`);
                }
                
                const result = await response.json();
                
                if (result.success && result.data) {
                    console.log('[TrendInterpretation] 加载成功', result.fromCache ? '(来自缓存)' : '(新生成)');
                    // 标准化 AI 返回的数据格式
                    const normalizedData = normalizeInterpretationData(result.data);
                    initTrendInterpretations(normalizedData);
                } else {
                    console.warn('[TrendInterpretation] 加载失败:', result.error);
                    showInterpretationEmpty();
                }
            } catch (error) {
                console.error('[TrendInterpretation] 加载出错:', error);
                // 显示错误状态但不影响其他功能
                document.getElementById('interpretationTrendBadge').textContent = '加载失败';
                document.getElementById('interpretationTrendBadge').className = 'px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400';
                document.getElementById('interpretationTrendDesc').textContent = '趋势解读加载失败，请刷新重试';
                document.getElementById('interpretationInsight').textContent = error.name === 'AbortError' ? '请求超时，请稍后重试' : '服务暂时不可用';
                document.getElementById('interpretationConcerns').textContent = '点击"重新分析"按钮可重新生成完整报告';
            }
        }
        
        // ========== 行业对比分析 ==========
        let currentIndustryComparisonCode = null;
        
        // 更新增强模块 - 行业对比Agent进度
        function updateIndustryComparisonAgentStatus(status, progress = 0) {
            const card = document.getElementById('industryComparisonAgentCard');
            const statusBadge = document.getElementById('industryComparisonAgentStatus');
            const progressBar = document.getElementById('industryComparisonAgentProgress');
            
            if (!card || !statusBadge || !progressBar) return;
            
            // 移除所有状态类
            card.classList.remove('waiting', 'loading', 'completed', 'error');
            
            switch (status) {
                case 'waiting':
                    card.classList.add('waiting');
                    statusBadge.textContent = '待执行';
                    statusBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400';
                    progressBar.style.width = '0%';
                    break;
                case 'loading':
                    card.classList.add('loading');
                    statusBadge.textContent = '分析中';
                    statusBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-orange-500/30 text-orange-400 animate-pulse';
                    progressBar.style.width = progress + '%';
                    break;
                case 'completed':
                    card.classList.add('completed');
                    statusBadge.textContent = '已完成';
                    statusBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-green-500/30 text-green-400';
                    progressBar.style.width = '100%';
                    break;
                case 'error':
                    card.classList.add('error');
                    statusBadge.textContent = '失败';
                    statusBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-red-500/30 text-red-400';
                    progressBar.style.width = '0%';
                    break;
                case 'locked':
                    card.classList.add('waiting');
                    statusBadge.innerHTML = '<i class="fas fa-lock mr-1"></i>Pro';
                    statusBadge.className = 'text-xs px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-400';
                    progressBar.style.width = '0%';
                    break;
            }
        }
        
        // 加载行业对比数据
        async function loadIndustryComparison(companyCode) {
            if (!companyCode) {
                console.warn('[IndustryComparison] No company code provided');
                return;
            }
            
            currentIndustryComparisonCode = companyCode;
            
            // 显示加载状态
            document.getElementById('industryComparisonLoading').classList.remove('hidden');
            document.getElementById('industryComparisonContent').classList.add('hidden');
            
            // 显示增强模块并更新行业对比Agent状态为加载中
            document.getElementById('enhancedModulesSection').classList.remove('hidden');
            updateIndustryComparisonAgentStatus('loading', 10);
            
            try {
                console.log('[IndustryComparison] Loading data for:', companyCode);
                
                // 更新进度 - 开始获取数据
                updateIndustryComparisonAgentStatus('loading', 30);
                
                // 先获取基础对比数据（快速返回）
                const basicResponse = await fetch(\`/api/stock/industry-comparison/\${companyCode}\`, {
                    headers: getAuthHeaders()
                });
                
                // 处理权限不足 (403)
                if (basicResponse.status === 403) {
                    const errorData = await basicResponse.json();
                    console.log('[IndustryComparison] 权限不足:', errorData);
                    
                    // 显示升级提示
                    showIndustryComparisonUpgradePrompt(errorData.upgradePrompt || '升级Pro会员，解锁行业对比分析');
                    updateIndustryComparisonAgentStatus('locked');
                    return;
                }
                
                const basicData = await basicResponse.json();
                
                // 更新进度 - 数据已获取
                updateIndustryComparisonAgentStatus('loading', 60);
                
                if (basicData.success) {
                    console.log('[IndustryComparison] Basic data loaded');
                    renderIndustryComparison(basicData);
                    
                    // 设置行业名称
                    document.getElementById('industryName').textContent = basicData.industry || '未知';
                    
                    // 更新进度 - 渲染完成
                    updateIndustryComparisonAgentStatus('loading', 80);
                    
                    // 异步加载AI深度分析（完成后更新为100%）
                    loadIndustryAIAnalysis(companyCode);
                } else {
                    console.warn('[IndustryComparison] Failed:', basicData.error);
                    showIndustryComparisonError(basicData.error || '加载失败');
                    updateIndustryComparisonAgentStatus('error');
                }
            } catch (error) {
                console.error('[IndustryComparison] Error:', error);
                showIndustryComparisonError('网络错误，请稍后重试');
                updateIndustryComparisonAgentStatus('error');
            }
        }
        
        // 渲染行业对比数据
        function renderIndustryComparison(data) {
            document.getElementById('industryComparisonLoading').classList.add('hidden');
            document.getElementById('industryComparisonContent').classList.remove('hidden');
            
            const { targetStock, industry, peers, metrics } = data;
            const { rankings, averages, comparisons } = metrics || {};
            
            // 行业地位摘要
            const positionSummary = document.getElementById('industryPositionSummary');
            const rankBadge = document.getElementById('industryRankBadge');
            const positionDesc = document.getElementById('industryPositionDesc');
            
            // 计算综合排名
            let avgRank = 0;
            let rankCount = 0;
            Object.values(rankings || {}).forEach(r => {
                if (r && r.rank) {
                    avgRank += r.rank;
                    rankCount++;
                }
            });
            avgRank = rankCount > 0 ? (avgRank / rankCount).toFixed(1) : '--';
            
            let positionClass = 'bg-gray-600 text-gray-200';
            let positionText = '行业一般';
            if (avgRank !== '--') {
                const avgRankNum = parseFloat(avgRank);
                if (avgRankNum <= 1.5) {
                    positionClass = 'bg-yellow-500 text-black';
                    positionText = '行业龙头';
                } else if (avgRankNum <= 2.5) {
                    positionClass = 'bg-blue-500 text-white';
                    positionText = '第一梯队';
                } else if (avgRankNum <= 3.5) {
                    positionClass = 'bg-green-500 text-white';
                    positionText = '第二梯队';
                } else {
                    positionClass = 'bg-gray-500 text-white';
                    positionText = '第三梯队';
                }
            }
            
            rankBadge.textContent = positionText;
            rankBadge.className = \`px-3 py-1 rounded-full text-sm font-bold \${positionClass}\`;
            
            // 生成描述
            const excellentMetrics = Object.entries(comparisons || {}).filter(([k, v]) => v.status === '优秀').length;
            const totalPeers = (peers || []).length + 1;
            positionDesc.textContent = \`\${targetStock?.name || '本公司'} 在 \${industry || '本行业'} \${totalPeers} 家主要公司中，综合排名约第 \${avgRank} 位，共有 \${excellentMetrics} 项核心指标领先行业平均水平。\`;
            
            // 指标对比表格
            const metricsTable = document.getElementById('industryMetricsTable');
            const metricsConfig = [
                { key: 'netprofit_margin', name: '净利率', suffix: '%' },
                { key: 'grossprofit_margin', name: '毛利率', suffix: '%' },
                { key: 'roe', name: 'ROE', suffix: '%' },
                { key: 'roa', name: 'ROA', suffix: '%' },
                { key: 'debt_to_assets', name: '资产负债率', suffix: '%' },
                { key: 'current_ratio', name: '流动比率', suffix: '' },
                { key: 'netprofit_yoy', name: '净利润同比', suffix: '%' },
                { key: 'or_yoy', name: '营收同比', suffix: '%' },
            ];
            
            metricsTable.innerHTML = metricsConfig.map(m => {
                const r = rankings?.[m.key] || {};
                const c = comparisons?.[m.key] || {};
                const avg = averages?.[m.key];
                
                const statusColors = {
                    '优秀': 'bg-green-500/20 text-green-400',
                    '良好': 'bg-blue-500/20 text-blue-400',
                    '一般': 'bg-gray-500/20 text-gray-400',
                    '较差': 'bg-red-500/20 text-red-400',
                };
                const statusClass = statusColors[c.status] || 'bg-gray-500/20 text-gray-400';
                
                return \`
                    <tr class="border-b border-gray-700/50 hover:bg-gray-800/30">
                        <td class="py-2 px-3 text-gray-300">\${m.name}</td>
                        <td class="text-right py-2 px-3 text-white font-semibold">\${r.value !== undefined ? r.value.toFixed(2) + m.suffix : '--'}</td>
                        <td class="text-right py-2 px-3 text-gray-400">\${avg !== undefined ? avg.toFixed(2) + m.suffix : '--'}</td>
                        <td class="text-right py-2 px-3 text-orange-400 font-semibold">\${r.rank || '--'}/\${r.total || '--'}</td>
                        <td class="text-center py-2 px-3">
                            <span class="px-2 py-0.5 rounded text-xs font-semibold \${statusClass}">\${c.status || '--'}</span>
                        </td>
                    </tr>
                \`;
            }).join('');
            
            // 保存数据用于柱状图
            window.industryComparisonData = data;
            
            // 初始化柱状图（默认显示净利率）
            initIndustryBarChart(data, 'netprofit_margin');
            
            // 对标公司列表
            const peersList = document.getElementById('peersList');
            peersList.innerHTML = (peers || []).map((peer, idx) => {
                const peerFina = data.comparisonData?.fina?.[peer.code] || {};
                return \`
                    <div class="flex items-center justify-between p-2 bg-gray-800/40 rounded-lg hover:bg-gray-800/60 transition">
                        <div class="flex items-center gap-2">
                            <span class="w-6 h-6 rounded-full bg-orange-600/30 text-orange-400 text-xs flex items-center justify-center font-bold">\${idx + 2}</span>
                            <span class="text-gray-200">\${peer.name}</span>
                            <span class="text-xs text-gray-500">\${peer.code}</span>
                        </div>
                        <div class="text-right text-xs text-gray-400">
                            <span class="mr-3">净利率: \${peerFina.netprofit_margin?.toFixed(1) || '--'}%</span>
                            <span>ROE: \${peerFina.roe?.toFixed(1) || '--'}%</span>
                        </div>
                    </div>
                \`;
            }).join('');
            
            // 初始化雷达图
            initIndustryRadarChart(data);
        }
        
        // 初始化行业对比雷达图
        function initIndustryRadarChart(data) {
            const chartDom = document.getElementById('industryRadarChart');
            if (!chartDom || typeof echarts === 'undefined') return;
            
            const chart = echarts.init(chartDom, 'dark');
            
            const { comparisons, averages } = data.metrics || {};
            
            // 计算各维度得分（归一化到0-100）
            const dimensions = ['盈利能力', '成长性', '偿债能力', '运营效率', '行业地位'];
            
            // 基于实际指标计算得分
            const targetScores = [];
            const avgScores = [];
            
            // 盈利能力 (净利率 + ROE)
            const profitScore = calculateDimensionScore(comparisons, ['netprofit_margin', 'roe']);
            targetScores.push(profitScore);
            avgScores.push(60);
            
            // 成长性 (营收同比 + 净利润同比)
            const growthScore = calculateDimensionScore(comparisons, ['or_yoy', 'netprofit_yoy']);
            targetScores.push(growthScore);
            avgScores.push(60);
            
            // 偿债能力 (资产负债率反向 + 流动比率)
            const debtScore = calculateDimensionScore(comparisons, ['debt_to_assets', 'current_ratio']);
            targetScores.push(debtScore);
            avgScores.push(60);
            
            // 运营效率 (毛利率 + ROA)
            const efficiencyScore = calculateDimensionScore(comparisons, ['grossprofit_margin', 'roa']);
            targetScores.push(efficiencyScore);
            avgScores.push(60);
            
            // 行业地位 (综合排名)
            const rankings = data.metrics?.rankings || {};
            let avgRank = 0;
            let rankCount = 0;
            Object.values(rankings).forEach(r => {
                if (r && r.rank && r.total) {
                    avgRank += (r.total - r.rank + 1) / r.total * 100;
                    rankCount++;
                }
            });
            targetScores.push(rankCount > 0 ? Math.round(avgRank / rankCount) : 50);
            avgScores.push(60);
            
            const option = {
                backgroundColor: 'transparent',
                legend: {
                    data: [data.targetStock?.name || '本公司', '行业均值'],
                    bottom: 0,
                    textStyle: { color: '#9ca3af', fontSize: 11 }
                },
                radar: {
                    indicator: dimensions.map(d => ({ name: d, max: 100 })),
                    shape: 'polygon',
                    splitNumber: 4,
                    axisName: { color: '#9ca3af', fontSize: 11 },
                    splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'] } },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
                },
                series: [{
                    type: 'radar',
                    data: [
                        {
                            value: targetScores,
                            name: data.targetStock?.name || '本公司',
                            symbol: 'circle',
                            symbolSize: 6,
                            lineStyle: { color: '#f97316', width: 2 },
                            areaStyle: { color: 'rgba(249, 115, 22, 0.3)' },
                            itemStyle: { color: '#f97316' }
                        },
                        {
                            value: avgScores,
                            name: '行业均值',
                            symbol: 'circle',
                            symbolSize: 4,
                            lineStyle: { color: '#6b7280', width: 1, type: 'dashed' },
                            areaStyle: { color: 'rgba(107, 114, 128, 0.1)' },
                            itemStyle: { color: '#6b7280' }
                        }
                    ]
                }]
            };
            
            chart.setOption(option);
            
            // 响应式
            window.addEventListener('resize', () => chart.resize());
        }
        
        // 计算维度得分
        function calculateDimensionScore(comparisons, keys) {
            if (!comparisons) return 50;
            
            let totalScore = 0;
            let count = 0;
            
            keys.forEach(key => {
                const c = comparisons[key];
                if (c && c.status) {
                    const scores = { '优秀': 90, '良好': 75, '一般': 55, '较差': 35 };
                    totalScore += scores[c.status] || 50;
                    count++;
                }
            });
            
            return count > 0 ? Math.round(totalScore / count) : 50;
        }
        
        // 行业对比柱状图实例
        let industryBarChartInstance = null;
        
        // 初始化/更新行业对比柱状图
        function initIndustryBarChart(data, metricKey) {
            const chartDom = document.getElementById('industryBarChart');
            if (!chartDom || typeof echarts === 'undefined') return;
            
            // 如果图表实例已存在，销毁后重建
            if (industryBarChartInstance) {
                industryBarChartInstance.dispose();
            }
            industryBarChartInstance = echarts.init(chartDom, 'dark');
            
            const { targetStock, peers, comparisonData } = data;
            const fina = comparisonData?.fina || {};
            
            // 指标配置
            const metricsConfig = {
                'netprofit_margin': { name: '净利率', suffix: '%', format: v => v?.toFixed(2) },
                'grossprofit_margin': { name: '毛利率', suffix: '%', format: v => v?.toFixed(2) },
                'roe': { name: 'ROE', suffix: '%', format: v => v?.toFixed(2) },
                'roa': { name: 'ROA', suffix: '%', format: v => v?.toFixed(2) },
                'debt_to_assets': { name: '资产负债率', suffix: '%', format: v => v?.toFixed(2) },
                'current_ratio': { name: '流动比率', suffix: '', format: v => v?.toFixed(2) },
                'or_yoy': { name: '营收同比', suffix: '%', format: v => v?.toFixed(2) },
                'netprofit_yoy': { name: '净利润同比', suffix: '%', format: v => v?.toFixed(2) },
            };
            
            const config = metricsConfig[metricKey] || { name: metricKey, suffix: '', format: v => v };
            
            // 构建数据：目标公司 + 对标公司
            const companies = [
                { code: targetStock?.code, name: targetStock?.name, isTarget: true },
                ...(peers || []).map(p => ({ code: p.code, name: p.name, isTarget: false }))
            ];
            
            const chartData = companies.map(company => {
                const value = fina[company.code]?.[metricKey];
                return {
                    name: company.name,
                    value: value !== undefined && value !== null ? parseFloat(value) : null,
                    isTarget: company.isTarget
                };
            }).filter(d => d.value !== null);
            
            // 按值排序（降序，除了资产负债率升序更好）
            const isLowerBetter = metricKey === 'debt_to_assets';
            chartData.sort((a, b) => isLowerBetter ? a.value - b.value : b.value - a.value);
            
            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function(params) {
                        const p = params[0];
                        const isTarget = chartData.find(d => d.name === p.name)?.isTarget;
                        return \`<div style="font-weight:\${isTarget ? 'bold' : 'normal'}">\${p.name}</div>
                                <div>\${config.name}: <span style="color:#f97316;font-weight:bold">\${p.value}\${config.suffix}</span></div>\`;
                    }
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    top: '10%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: chartData.map(d => d.name),
                    axisLabel: {
                        color: '#9ca3af',
                        fontSize: 11,
                        rotate: chartData.length > 4 ? 15 : 0,
                        formatter: function(value) {
                            return value.length > 4 ? value.substring(0, 4) + '...' : value;
                        }
                    },
                    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    name: config.name + (config.suffix ? \`(\${config.suffix})\` : ''),
                    nameTextStyle: { color: '#9ca3af', fontSize: 11 },
                    axisLabel: { color: '#9ca3af', fontSize: 10 },
                    axisLine: { show: false },
                    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
                },
                series: [{
                    type: 'bar',
                    data: chartData.map(d => ({
                        value: d.value,
                        itemStyle: {
                            color: d.isTarget 
                                ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: '#f97316' },
                                    { offset: 1, color: '#ea580c' }
                                  ])
                                : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                    { offset: 0, color: '#4b5563' },
                                    { offset: 1, color: '#374151' }
                                  ]),
                            borderRadius: [4, 4, 0, 0]
                        },
                        emphasis: {
                            itemStyle: {
                                color: d.isTarget 
                                    ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                        { offset: 0, color: '#fb923c' },
                                        { offset: 1, color: '#f97316' }
                                      ])
                                    : new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                        { offset: 0, color: '#6b7280' },
                                        { offset: 1, color: '#4b5563' }
                                      ])
                            }
                        }
                    })),
                    barWidth: '60%',
                    label: {
                        show: true,
                        position: 'top',
                        color: '#9ca3af',
                        fontSize: 10,
                        formatter: function(params) {
                            const d = chartData[params.dataIndex];
                            const prefix = d.isTarget ? '★ ' : '';
                            return prefix + params.value + config.suffix;
                        }
                    }
                }]
            };
            
            industryBarChartInstance.setOption(option);
            
            // 响应式
            window.addEventListener('resize', () => {
                if (industryBarChartInstance) {
                    industryBarChartInstance.resize();
                }
            });
        }
        
        // 切换柱状图指标
        function switchIndustryBarChart(metricKey) {
            // 更新Tab样式
            const tabs = document.querySelectorAll('#industryBarChartTabs button');
            tabs.forEach(tab => {
                if (tab.getAttribute('data-metric') === metricKey) {
                    tab.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600/30 text-orange-400 border border-orange-600/50 transition hover:bg-orange-600/40';
                } else {
                    tab.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-700/50 text-gray-400 border border-gray-600/50 transition hover:bg-gray-700';
                }
            });
            
            // 更新图表
            if (window.industryComparisonData) {
                initIndustryBarChart(window.industryComparisonData, metricKey);
            }
        }
        
        // 加载AI深度分析（异步）
        async function loadIndustryAIAnalysis(companyCode) {
            const aiAnalysisDiv = document.getElementById('industryAIAnalysis');
            aiAnalysisDiv.innerHTML = '<div class="text-center py-4 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>AI正在进行深度行业分析...</div>';
            
            // 更新增强模块进度
            updateIndustryComparisonAgentStatus('loading', 90);
            
            try {
                const response = await fetch(\`/api/analyze/industry-comparison/\${companyCode}\`, {
                    headers: getAuthHeaders()
                });
                const data = await response.json();
                
                // 处理权限不足 (403)
                if (!data.success && data.needUpgrade) {
                    // 显示升级提示（内嵌样式）
                    aiAnalysisDiv.innerHTML = \`
                        <div class="border-2 border-dashed border-orange-600/30 rounded-lg p-6 text-center bg-gradient-to-br from-orange-900/10 to-orange-800/5">
                            <i class="fas fa-lock text-3xl text-orange-500 mb-3"></i>
                            <h4 class="text-lg font-semibold text-orange-400 mb-2">AI深度行业分析</h4>
                            <p class="text-gray-400 text-sm mb-4">\${data.upgradePrompt || '升级Pro会员解锁AI深度分析'}</p>
                            <div class="flex gap-3 justify-center">
                                <a href="/membership" class="btn-gold px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2">
                                    <i class="fas fa-crown"></i>立即升级
                                </a>
                                <button onclick="showModal('loginModal')" class="btn-outline px-4 py-2 rounded-lg text-sm">
                                    <i class="fas fa-sign-in-alt"></i>登录
                                </button>
                            </div>
                        </div>
                    \`;
                    // 基础对比数据已加载，标记为完成（部分功能需升级）
                    updateIndustryComparisonAgentStatus('completed');
                    return;
                }
                
                if (data.success && data.aiAnalysis) {
                    renderIndustryAIAnalysis(data.aiAnalysis);
                    // 完成：更新增强模块状态为已完成
                    updateIndustryComparisonAgentStatus('completed');
                } else {
                    aiAnalysisDiv.innerHTML = '<div class="text-center py-4 text-gray-500">AI分析暂不可用</div>';
                    // 基础数据加载完成，即使AI分析不可用也标记为完成
                    updateIndustryComparisonAgentStatus('completed');
                }
            } catch (error) {
                console.error('[IndustryAIAnalysis] Error:', error);
                aiAnalysisDiv.innerHTML = '<div class="text-center py-4 text-red-400">AI分析加载失败，请稍后重试</div>';
                // 基础数据已加载，仅AI分析失败，仍标记为完成（部分完成）
                updateIndustryComparisonAgentStatus('completed');
            }
        }
        
        // 渲染AI深度分析
        function renderIndustryAIAnalysis(analysis) {
            const aiAnalysisDiv = document.getElementById('industryAIAnalysis');
            
            // 处理可能的格式
            const summary = analysis.summary || {};
            const profitability = analysis.profitabilityComparison || {};
            const competitive = analysis.competitiveAnalysis || {};
            const implication = analysis.investmentImplication || {};
            
            let html = '';
            
            // 核心优势
            if (summary.coreAdvantages && summary.coreAdvantages.length > 0) {
                html += \`
                    <div class="mb-4">
                        <h4 class="text-orange-400 font-semibold mb-2"><i class="fas fa-star mr-2"></i>核心优势</h4>
                        <ul class="list-disc list-inside space-y-1 text-gray-300">
                            \${summary.coreAdvantages.map(a => \`<li>\${a}</li>\`).join('')}
                        </ul>
                    </div>
                \`;
            }
            
            // 主要劣势
            if (summary.coreWeaknesses && summary.coreWeaknesses.length > 0) {
                html += \`
                    <div class="mb-4">
                        <h4 class="text-red-400 font-semibold mb-2"><i class="fas fa-exclamation-triangle mr-2"></i>潜在不足</h4>
                        <ul class="list-disc list-inside space-y-1 text-gray-300">
                            \${summary.coreWeaknesses.map(w => \`<li>\${w}</li>\`).join('')}
                        </ul>
                    </div>
                \`;
            }
            
            // 盈利能力分析
            if (profitability.analysis) {
                html += \`
                    <div class="mb-4">
                        <h4 class="text-blue-400 font-semibold mb-2"><i class="fas fa-chart-line mr-2"></i>盈利能力分析</h4>
                        <p class="text-gray-300">\${profitability.analysis}</p>
                    </div>
                \`;
            }
            
            // 竞争优势
            if (competitive.competitiveAdvantages && competitive.competitiveAdvantages.length > 0) {
                html += \`
                    <div class="mb-4">
                        <h4 class="text-green-400 font-semibold mb-2"><i class="fas fa-shield-alt mr-2"></i>竞争优势</h4>
                        <ul class="list-disc list-inside space-y-1 text-gray-300">
                            \${competitive.competitiveAdvantages.map(a => \`<li>\${a}</li>\`).join('')}
                        </ul>
                    </div>
                \`;
            }
            
            // 行业趋势
            if (competitive.industryTrend) {
                html += \`
                    <div class="mb-4">
                        <h4 class="text-purple-400 font-semibold mb-2"><i class="fas fa-trending-up mr-2"></i>行业趋势</h4>
                        <p class="text-gray-300">\${competitive.industryTrend}</p>
                    </div>
                \`;
            }
            
            // 投资建议
            if (implication.recommendation) {
                html += \`
                    <div class="p-3 bg-orange-900/20 border border-orange-600/30 rounded-lg">
                        <h4 class="text-orange-400 font-semibold mb-2"><i class="fas fa-lightbulb mr-2"></i>投资建议</h4>
                        <p class="text-gray-200">\${implication.recommendation}</p>
                    </div>
                \`;
            }
            
            // 如果是原始分析文本
            if (analysis.rawAnalysis) {
                html = \`<div class="text-gray-300 whitespace-pre-wrap">\${analysis.rawAnalysis}</div>\`;
            }
            
            aiAnalysisDiv.innerHTML = html || '<div class="text-center py-4 text-gray-500">暂无详细分析</div>';
        }
        
        // 显示行业对比错误
        function showIndustryComparisonError(message) {
            document.getElementById('industryComparisonLoading').classList.add('hidden');
            document.getElementById('industryComparisonContent').innerHTML = \`
                <div class="text-center py-8 text-red-400">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                    <p>\${message}</p>
                    <button onclick="loadIndustryComparison(currentIndustryComparisonCode)" class="mt-4 btn-outline px-4 py-2 rounded-lg text-sm">
                        <i class="fas fa-sync-alt mr-1"></i>重试
                    </button>
                </div>
            \`;
            document.getElementById('industryComparisonContent').classList.remove('hidden');
        }
        
        // 显示行业对比升级提示（权限不足时）
        function showIndustryComparisonUpgradePrompt(message) {
            document.getElementById('industryComparisonLoading').classList.add('hidden');
            document.getElementById('industryComparisonContent').innerHTML = \`
                <div class="text-center py-12">
                    <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 flex items-center justify-center">
                        <i class="fas fa-crown text-4xl gold-text"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-2">Pro 会员专属功能</h3>
                    <p class="text-gray-400 mb-6 max-w-sm mx-auto">\${message}</p>
                    <div class="flex flex-col sm:flex-row gap-3 justify-center">
                        <a href="/membership" class="btn-gold px-6 py-3 rounded-lg font-semibold inline-flex items-center gap-2">
                            <i class="fas fa-rocket"></i>升级Pro会员
                        </a>
                        <button onclick="showModal('loginModal')" class="btn-outline px-6 py-3 rounded-lg font-semibold inline-flex items-center gap-2">
                            <i class="fas fa-sign-in-alt"></i>登录账号
                        </button>
                    </div>
                    <div class="mt-6 p-4 bg-gray-800/50 rounded-lg max-w-md mx-auto">
                        <p class="text-sm text-gray-500 mb-2">Pro 会员专享权益：</p>
                        <ul class="text-xs text-gray-400 space-y-1 text-left">
                            <li><i class="fas fa-check text-green-500 mr-2"></i>行业对比深度分析</li>
                            <li><i class="fas fa-check text-green-500 mr-2"></i>AI漫画解读生成</li>
                            <li><i class="fas fa-check text-green-500 mr-2"></i>风险评估详情</li>
                            <li><i class="fas fa-check text-green-500 mr-2"></i>每日50次分析额度</li>
                        </ul>
                    </div>
                </div>
            \`;
            document.getElementById('industryComparisonContent').classList.remove('hidden');
        }
        
        // 标准化 AI 返回的趋势解读数据
        function normalizeInterpretationData(data) {
            const normalized = {};
            const metricKeys = ['netProfit', 'revenue', 'operatingProfit', 'eps', 'grossMargin', 'netMargin', 'roe', 'debtRatio'];
            
            console.log('[normalizeInterpretationData] 输入数据结构:', Object.keys(data || {}));
            
            // === 兼容旧格式缓存: { trend_analysis: { netProfit: { trend, description }, ... } } ===
            if (data && data.trend_analysis && typeof data.trend_analysis === 'object') {
                console.log('[normalizeInterpretationData] 检测到旧格式 trend_analysis，进行转换');
                const trendAnalysis = data.trend_analysis;
                
                metricKeys.forEach(key => {
                    const raw = trendAnalysis[key];
                    if (!raw) {
                        normalized[key] = null;
                        return;
                    }
                    
                    const description = raw.description || raw.trend || '';
                    const trendText = raw.trend || '';
                    
                    // 从描述中智能提取数值
                    let latestValue = '--';
                    let yoyChange = '--';
                    let yoyDirection = 'flat';
                    
                    // 提取最新数值 (如 "646.3亿元" 或 "52%-55%" 或 "26.4%")
                    const valueMatch = description.match(/([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(亿元|亿|%|元)/);
                    if (valueMatch) {
                        latestValue = valueMatch[1] + valueMatch[2];
                    }
                    
                    // 提取同比变化
                    const yoyMatch = description.match(/同比[增长下降变化为]*\s*([-+]?[0-9]{1,3}(?:\.[0-9]{1,2})?)\s*%/);
                    if (yoyMatch) {
                        const yoyVal = parseFloat(yoyMatch[1]);
                        yoyChange = (yoyVal >= 0 ? '+' : '') + yoyVal.toFixed(2) + '%';
                        yoyDirection = yoyVal > 0.5 ? 'up' : (yoyVal < -0.5 ? 'down' : 'flat');
                    }
                    
                    // 判断趋势方向
                    let trend = 'flat';
                    let trendLabel = '波动';
                    const combinedText = (trendText + ' ' + description).toLowerCase();
                    if (combinedText.includes('增长') || combinedText.includes('上升') || combinedText.includes('提升') || combinedText.includes('扩大')) {
                        trend = 'up';
                        trendLabel = '上升';
                    } else if (combinedText.includes('下降') || combinedText.includes('下滑') || combinedText.includes('放缓') || combinedText.includes('下行')) {
                        trend = 'down';
                        trendLabel = '下降';
                    } else if (combinedText.includes('稳定') || combinedText.includes('持平') || combinedText.includes('平稳') || combinedText.includes('维持')) {
                        trend = 'flat';
                        trendLabel = '持平';
                    }
                    
                    // 智能提取关注点
                    let concerns = '';
                    const riskMatch = description.match(/(风险|注意|关注|挑战|压力|隐忧|警惕|值得注意|需要关注)[^。]*。/g);
                    if (riskMatch && riskMatch.length > 0) {
                        concerns = riskMatch.slice(0, 2).join(' ');
                    } else {
                        // 提取最后一句作为总结
                        const sentences = description.split(/[。！？]/).filter(s => s.trim().length > 10);
                        if (sentences.length >= 1) {
                            concerns = sentences.slice(-1)[0] + '。';
                        } else {
                            concerns = '建议持续跟踪该指标变化趋势。';
                        }
                    }
                    
                    normalized[key] = {
                        latestValue: latestValue,
                        latestPeriod: '--',
                        yoyChange: yoyChange,
                        yoyDirection: yoyDirection,
                        trend: trend,
                        trendLabel: trendLabel,
                        trendPeriods: trendText,
                        peakInfo: '',
                        insight: description || '暂无深度洞察',
                        concerns: concerns
                    };
                });
                
                console.log('[normalizeInterpretationData] 旧格式转换完成，指标数:', Object.keys(normalized).length);
                return normalized;
            }
            
            // 如果数据是 { rawResult: "..." } 格式，尝试从文本中提取各指标的解读
            if (data && data.rawResult && typeof data.rawResult === 'string') {
                const rawText = data.rawResult;
                console.log('[normalizeInterpretationData] 处理 rawResult 格式，文本长度:', rawText.length);
                
                // 指标中英文名称映射（包含多种可能的表述）
                const labelPatterns = {
                    netProfit: ['净利润', '归母净利润', '归属于母公司股东的净利润', 'n_income_attr_p'],
                    revenue: ['营业收入', '营收', '总营收', '总收入', 'total_revenue', 'total_rev'],
                    operatingProfit: ['营业利润', '经营利润', 'operating_profit'],
                    eps: ['每股收益', '基本每股收益', 'EPS', 'basic_eps'],
                    grossMargin: ['毛利率', 'gross_margin', '销售毛利率'],
                    netMargin: ['净利率', '净利润率', 'net_margin', 'netprofit_margin'],
                    roe: ['ROE', 'roe', '净资产收益率', '股东权益回报率'],
                    debtRatio: ['资产负债率', '负债率', 'debt_ratio', 'debt_to_assets']
                };
                
                // 为每个指标提取解读（使用简单字符串匹配）
                metricKeys.forEach(key => {
                    const patterns = labelPatterns[key] || [key];
                    let insight = '';
                    let matchedContent = '';
                    
                    // 尝试用字符串搜索匹配（避免复杂正则在模板字符串中的转义问题）
                    for (const pattern of patterns) {
                        // 在文本中找到该指标的位置
                        const patternIndex = rawText.indexOf(pattern);
                        if (patternIndex === -1) continue;
                        
                        // 从该位置开始提取最多800个字符
                        let endIndex = patternIndex + 800;
                        
                        // 尝试找到下一个段落分隔符（双换行）
                        const nextDoubleNewline = rawText.indexOf('\\n\\n', patternIndex + pattern.length);
                        if (nextDoubleNewline !== -1 && nextDoubleNewline < endIndex) {
                            // 再找下一个，因为我们想要完整的段落
                            const secondDoubleNewline = rawText.indexOf('\\n\\n', nextDoubleNewline + 2);
                            if (secondDoubleNewline !== -1 && secondDoubleNewline < patternIndex + 1000) {
                                endIndex = secondDoubleNewline;
                            }
                        }
                        
                        const extracted = rawText.substring(patternIndex, Math.min(endIndex, rawText.length));
                        if (extracted.length > matchedContent.length) {
                            matchedContent = extracted;
                        }
                        
                        if (matchedContent.length > 100) break;
                    }
                    
                    // 清理并截取内容
                    if (matchedContent) {
                        // 移除 markdown 标记
                        insight = matchedContent
                            .replace(/[*]{1,2}/g, '')
                            .replace(/^[0-9]+\\.\\s*/, '')
                            .replace(/\\n+/g, ' ')
                            .trim();
                        // 限制长度但保持句子完整
                        if (insight.length > 350) {
                            const cutPoint = insight.substring(0, 350).lastIndexOf('。');
                            insight = cutPoint > 200 ? insight.substring(0, cutPoint + 1) : insight.substring(0, 350) + '...';
                        }
                    }
                    
                    if (!insight || insight.length < 30) {
                        insight = '请参阅完整分析报告了解详情';
                    }
                    
                    // 从 insight 中提取具体数值
                    let latestValue = '--';
                    let yoyChange = '--';
                    let yoyDirection = 'flat';
                    
                    // 使用简单正则提取最新数值（如 "3355.77亿元" 或 "44.83%"）
                    try {
                        const valueMatch = insight.match(/([0-9]{1,4}(?:\\.[0-9]{1,2})?)\\s*(亿元|亿|%|元)/);
                        if (valueMatch) {
                            latestValue = valueMatch[1] + valueMatch[2];
                        }
                        
                        // 提取同比变化（如 "同比增长7.06%" 或 "-3.99%"）
                        const yoyMatch = insight.match(/同比[增长下降变化为]*\\s*([-+]?[0-9]{1,3}(?:\\.[0-9]{1,2})?)\\s*%?/);
                        if (yoyMatch) {
                            const yoyVal = parseFloat(yoyMatch[1]);
                            yoyChange = (yoyVal >= 0 ? '+' : '') + yoyVal.toFixed(2) + '%';
                            yoyDirection = yoyVal > 0.5 ? 'up' : (yoyVal < -0.5 ? 'down' : 'flat');
                        }
                    } catch (e) {
                        console.warn('[normalizeInterpretationData] 正则匹配失败:', e);
                    }
                    
                    // 判断趋势
                    let trend = 'flat';
                    let trendLabel = '波动';
                    if (insight.includes('持续增长') || insight.includes('稳步增长') || insight.includes('大幅增长') || insight.includes('显著回升')) {
                        trend = 'up';
                        trendLabel = '上升';
                    } else if (insight.includes('增长') || insight.includes('回升') || insight.includes('改善') || insight.includes('提升')) {
                        trend = 'up';
                        trendLabel = '上升';
                    } else if (insight.includes('下降') || insight.includes('下滑') || insight.includes('恶化') || insight.includes('收窄') || insight.includes('下行')) {
                        trend = 'down';
                        trendLabel = '下降';
                    } else if (insight.includes('放缓') || insight.includes('承压') || insight.includes('转负')) {
                        trend = 'down';
                        trendLabel = '放缓';
                    } else if (insight.includes('稳定') || insight.includes('持平') || insight.includes('平稳')) {
                        trend = 'flat';
                        trendLabel = '持平';
                    }
                    
                    // 提取关注点 - 智能提取，永不显示空洞内容
                    let concerns = '';
                    try {
                        // 优先匹配风险相关句子
                        const concernsMatch = insight.match(/(风险|注意|关注|挑战|压力|隐忧|警惕|需要关注|值得注意|可能面临|潜在)[^。]*。/g);
                        if (concernsMatch && concernsMatch.length > 0) {
                            concerns = concernsMatch.slice(0, 2).join(' ');
                        } else {
                            // 如果没有明确的风险句，提取最后1-2句作为总结
                            const sentences = insight.split(/[。！？]/).filter(s => s.trim().length > 10);
                            if (sentences.length >= 2) {
                                concerns = sentences.slice(-2).join('。') + '。';
                            } else if (sentences.length === 1) {
                                concerns = sentences[0] + '。';
                            } else {
                                concerns = '整体表现需持续跟踪，建议关注后续财报变化。';
                            }
                        }
                    } catch (e) {
                        console.warn('[normalizeInterpretationData] 关注点匹配失败:', e);
                        concerns = '数据波动需关注，建议结合行业趋势综合判断。';
                    }
                    
                    normalized[key] = {
                        latestValue: latestValue,
                        latestPeriod: '--',
                        yoyChange: yoyChange,
                        yoyDirection: yoyDirection,
                        trend: trend,
                        trendLabel: trendLabel,
                        trendPeriods: '',
                        peakInfo: '',
                        insight: insight,
                        concerns: concerns
                    };
                });
                
                console.log('[normalizeInterpretationData] 处理完成，指标数:', Object.keys(normalized).length);
                return normalized;
            }
            
            metricKeys.forEach(key => {
                const raw = data[key];
                if (!raw) {
                    normalized[key] = null;
                    return;
                }
                
                // 如果 raw 是字符串（AI 直接返回了描述文字），转换为对象格式
                if (typeof raw === 'string') {
                    const text = raw;
                    // 从文字中提取趋势方向
                    let trend = 'flat';
                    let trendLabel = '波动';
                    const textLower = text.toLowerCase();
                    if (textLower.includes('持续增长') || textLower.includes('稳步增长') || textLower.includes('持续上升')) {
                        trend = 'up';
                        trendLabel = '上升';
                    } else if (textLower.includes('增长') || textLower.includes('上升') || textLower.includes('提升') || textLower.includes('增加')) {
                        trend = 'up';
                        trendLabel = '上升';
                    }
                    // 如果同时有增长和放缓，以放缓为主（如"增长放缓"）
                    if (textLower.includes('放缓') || textLower.includes('下滑') || textLower.includes('下降') || textLower.includes('下行')) {
                        trend = 'down';
                        trendLabel = '放缓';
                    }
                    if (textLower.includes('稳定') || textLower.includes('持平') || textLower.includes('平稳') || textLower.includes('维持')) {
                        trend = 'flat';
                        trendLabel = '持平';
                    }
                    
                    // 从文本中提取最新值（如"627亿元" "51.53元" "52%-55%" "26.37%"）
                    let latestValue = '--';
                    let latestPeriod = '--';
                    
                    // 尝试提取最新季度数据（如"2025年三季度的646亿元"）
                    const quarterMatch = text.match(/(202[0-9]年[一二三四]季度)[^0-9]*([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(亿元|亿|%|元)/);
                    if (quarterMatch) {
                        latestPeriod = quarterMatch[1];
                        latestValue = quarterMatch[2] + quarterMatch[3];
                    } else {
                        // 提取最后出现的数值作为最新值
                        const allValues = text.match(/([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(亿元|亿|%|元)/g);
                        if (allValues && allValues.length > 0) {
                            latestValue = allValues[allValues.length - 1].replace(/\s/g, '');
                        }
                        // 提取季度信息
                        const periodMatch = text.match(/(202[0-9]年[一二三四]季度|202[0-9]年末|202[0-9]年报)/);
                        if (periodMatch) {
                            latestPeriod = periodMatch[1];
                        }
                    }
                    
                    // 从文本中提取同比变化
                    let yoyChange = '--';
                    let yoyDirection = 'flat';
                    const yoyMatch = text.match(/同比[增长下降变化为幅度达]*\s*([-+]?[0-9]{1,3}(?:\.[0-9]{1,2})?)\s*%/);
                    if (yoyMatch) {
                        const yoyVal = parseFloat(yoyMatch[1]);
                        yoyChange = (yoyVal >= 0 ? '+' : '') + yoyVal.toFixed(2) + '%';
                        yoyDirection = yoyVal > 0.5 ? 'up' : (yoyVal < -0.5 ? 'down' : 'flat');
                    } else {
                        // 尝试提取年均增速
                        const growthMatch = text.match(/增速[约为达]*\s*([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*%/);
                        if (growthMatch) {
                            const growthVal = parseFloat(growthMatch[1]);
                            yoyChange = '+' + growthVal.toFixed(2) + '%';
                            yoyDirection = growthVal > 0.5 ? 'up' : 'flat';
                        }
                    }
                    
                    // 从文本中智能提取关注点
                    let textConcerns = '';
                    const riskMatch = text.match(/(风险|注意|关注|挑战|压力|隐忧|警惕|需要关注|可能面临|抗风险|为公司)[^。]*。/g);
                    if (riskMatch && riskMatch.length > 0) {
                        textConcerns = riskMatch.slice(0, 2).join(' ');
                    } else {
                        // 提取最后1-2句作为关注点
                        const sentences = text.split(/[。！？]/).filter(s => s.trim().length > 10);
                        if (sentences.length >= 2) {
                            textConcerns = sentences.slice(-2).join('。') + '。';
                        } else if (sentences.length === 1) {
                            textConcerns = sentences[0] + '。';
                        } else {
                            textConcerns = '建议持续关注该指标的后续变化趋势。';
                        }
                    }
                    
                    normalized[key] = {
                        latestValue: latestValue,
                        latestPeriod: latestPeriod,
                        yoyChange: yoyChange,
                        yoyDirection: yoyDirection,
                        trend: trend,
                        trendLabel: trendLabel,
                        trendPeriods: '',
                        peakInfo: '',
                        insight: text,
                        concerns: textConcerns
                    };
                    return;
                }
                
                // 处理 latestValue - 可能是数字或字符串
                let latestValue = raw.latestValue || raw.latest_value;
                if (typeof latestValue === 'number') {
                    // 数字转换为亿或%
                    if (key === 'grossMargin' || key === 'netMargin' || key === 'roe' || key === 'debtRatio') {
                        latestValue = latestValue.toFixed(2) + '%';
                    } else if (key === 'eps') {
                        latestValue = latestValue.toFixed(2) + '元';
                    } else {
                        latestValue = (latestValue / 100000000).toFixed(2) + '亿';
                    }
                }
                
                // 处理 yoyChange
                let yoyChange = raw.yoyChange || raw.yoy_change;
                let yoyDirection = raw.yoyDirection || raw.yoy_direction;
                if (raw.yoy_growth !== undefined && !yoyChange) {
                    const growth = typeof raw.yoy_growth === 'number' ? raw.yoy_growth : 0;
                    yoyChange = (growth >= 0 ? '+' : '') + growth.toFixed(2) + '%';
                    yoyDirection = growth > 0.5 ? 'up' : (growth < -0.5 ? 'down' : 'flat');
                }
                
                // 处理 trend
                let trend = raw.trend;
                let trendLabel = raw.trendLabel || raw.trend_label;
                if (typeof trend === 'string' && trend.length > 10) {
                    // AI 返回了文字描述作为 trend
                    const trendText = trend.toLowerCase();
                    if (trendText.includes('增长') || trendText.includes('上升') || trendText.includes('growing')) {
                        trend = 'up';
                        trendLabel = '上升';
                    } else if (trendText.includes('下降') || trendText.includes('下滑') || trendText.includes('declining')) {
                        trend = 'down';
                        trendLabel = '下降';
                    } else {
                        trend = 'flat';
                        trendLabel = '波动';
                    }
                    // 将原 trend 文字作为 insight
                    if (!raw.insight) {
                        raw.insight = raw.trend;
                    }
                }
                
                // 如果没有 trendLabel，从 trend 推断
                if (!trendLabel) {
                    if (trend === 'up') trendLabel = '上升';
                    else if (trend === 'down') trendLabel = '下降';
                    else trendLabel = '持平';
                }
                
                // 获取洞察文本：优先级为 insight > description > trend
                const insightText = raw.insight || raw.description || raw.trend || '';
                
                // 从描述中智能提取数值（如果 latestValue 未设置）
                if (!latestValue || latestValue === '--') {
                    const valueMatch = insightText.match(/([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(亿元|亿|%|元)/);
                    if (valueMatch) {
                        latestValue = valueMatch[1] + valueMatch[2];
                    }
                }
                
                // 从描述中提取同比变化（如果 yoyChange 未设置）
                if (!yoyChange || yoyChange === '--') {
                    const yoyMatch = insightText.match(/同比[增长下降变化为]*\s*([-+]?[0-9]{1,3}(?:\.[0-9]{1,2})?)\s*%/);
                    if (yoyMatch) {
                        const yoyVal = parseFloat(yoyMatch[1]);
                        yoyChange = (yoyVal >= 0 ? '+' : '') + yoyVal.toFixed(2) + '%';
                        yoyDirection = yoyVal > 0.5 ? 'up' : (yoyVal < -0.5 ? 'down' : 'flat');
                    }
                }
                
                normalized[key] = {
                    latestValue: latestValue || '--',
                    latestPeriod: raw.latestPeriod || raw.latest_period || raw.latest_date || '--',
                    yoyChange: yoyChange || '--',
                    yoyDirection: yoyDirection || 'flat',
                    trend: trend || 'flat',
                    trendLabel: trendLabel || '持平',
                    trendPeriods: raw.trendPeriods || raw.trend_periods || '',
                    peakInfo: raw.peakInfo || raw.peak_info || '',
                    insight: insightText || '暂无深度洞察',
                    concerns: raw.concerns && raw.concerns !== '详见完整分析报告' ? raw.concerns : (
                        // 如果没有关注点，从 insight/description 中提取
                        (() => {
                            if (!insightText) return '建议持续关注该指标变化。';
                            const riskMatch = insightText.match(/(风险|注意|关注|挑战|压力|隐忧|警惕|需要关注|可能面临|抗风险|抗压)[^。]*。/g);
                            if (riskMatch && riskMatch.length > 0) {
                                return riskMatch.slice(0, 2).join(' ');
                            }
                            // 提取最后一两句作为关注点总结
                            const sentences = insightText.split(/[。！？]/).filter(s => s.trim().length > 10);
                            if (sentences.length >= 2) {
                                return sentences.slice(-2).join('。') + '。';
                            } else if (sentences.length === 1) {
                                return sentences[0] + '。';
                            }
                            return '建议结合行业趋势综合判断。';
                        })()
                    )
                };
            });
            
            return normalized;
        }
        
        // 初始化利润表图表
        function initIncomeChart(chartData) {
            if (!chartData) {
                console.warn('[Chart] No chart data for income chart');
                return;
            }
            
            const chartDom = document.getElementById('incomeChart');
            if (!chartDom) {
                console.warn('[Chart] Income chart container not found');
                return;
            }
            
            if (typeof echarts === 'undefined') {
                console.error('[Chart] ECharts not loaded for income chart');
                return;
            }
            
            try {
                if (incomeChart) {
                    incomeChart.dispose();
                }
                incomeChart = echarts.init(chartDom, 'dark');
                console.log('[Chart] Income chart initialized');
                updateIncomeChart();
            } catch (error) {
                console.error('[Chart] Failed to initialize income chart:', error);
            }
        }
        
        // 更新利润表图表
        function updateIncomeChart() {
            if (!incomeChart || !currentChartData) return;
            
            const income = currentChartData.income || [];
            let filteredData = filterByPeriod(income, currentPeriodFilter);
            
            // 按日期排序并限制数量
            filteredData = filteredData
                .sort((a, b) => a.end_date?.localeCompare(b.end_date) || 0)
                .slice(-12);
            
            const periods = filteredData.map(d => formatPeriod(d.end_date));
            
            let fieldConfig;
            switch (currentIncomeChartType) {
                case 'incomeNetProfit':
                    fieldConfig = { field: 'n_income_attr_p', label: '归母净利润', color: '#3b82f6' };
                    break;
                case 'incomeOperating':
                    fieldConfig = { field: 'operate_profit', label: '营业利润', color: '#10b981' };
                    break;
                case 'incomeRevenue':
                    fieldConfig = { field: 'total_revenue', label: '营业收入', color: '#8b5cf6' };
                    break;
                default:
                    fieldConfig = { field: 'n_income_attr_p', label: '归母净利润', color: '#3b82f6' };
            }
            
            const values = filteredData.map(d => {
                const val = d[fieldConfig.field];
                return val ? (val / 100000000).toFixed(2) : null;
            });
            
            const yoyValues = calculateYoY(filteredData, fieldConfig.field);
            
            const option = {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(20, 20, 40, 0.95)',
                    borderColor: 'rgba(212, 175, 55, 0.3)',
                    textStyle: { color: '#fff', fontSize: 12 },
                    formatter: function(params) {
                        let html = '<div style="font-weight:600;margin-bottom:8px;color:#d4af37;">' + params[0].axisValue + '</div>';
                        params.forEach(p => {
                            const marker = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + p.color + ';margin-right:6px;"></span>';
                            let value = p.seriesName.includes('同比') ? p.value?.toFixed(2) + '%' : p.value + '亿';
                            const color = p.seriesName.includes('同比') ? (p.value >= 0 ? '#10b981' : '#ef4444') : p.color;
                            html += '<div style="margin:4px 0;">' + marker + p.seriesName + ': <span style="font-weight:600;color:' + color + '">' + (value || '--') + '</span></div>';
                        });
                        return html;
                    }
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '3%',
                    top: '10%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: periods,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisTick: { show: false },
                    axisLabel: { color: '#9ca3af', fontSize: 11 }
                },
                yAxis: [
                    {
                        type: 'value',
                        name: fieldConfig.label + '(亿)',
                        nameTextStyle: { color: '#9ca3af', fontSize: 11 },
                        axisLine: { show: false },
                        splitLine: { lineStyle: { color: '#1f2937', type: 'dashed' } },
                        axisLabel: { color: '#9ca3af', fontSize: 11 }
                    },
                    {
                        type: 'value',
                        name: '同比(%)',
                        nameTextStyle: { color: '#9ca3af', fontSize: 11 },
                        axisLine: { show: false },
                        splitLine: { show: false },
                        axisLabel: { color: '#9ca3af', fontSize: 11, formatter: '{value}%' }
                    }
                ],
                series: [
                    {
                        name: fieldConfig.label,
                        type: 'bar',
                        data: values,
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: fieldConfig.color },
                                { offset: 1, color: fieldConfig.color + '80' }
                            ]),
                            borderRadius: [4, 4, 0, 0]
                        },
                        barMaxWidth: 40
                    },
                    {
                        name: '同比',
                        type: 'line',
                        yAxisIndex: 1,
                        data: yoyValues,
                        smooth: true,
                        symbol: 'circle',
                        symbolSize: 6,
                        lineStyle: { color: '#f97316', width: 2 },
                        itemStyle: { color: '#f97316' }
                    }
                ]
            };
            
            incomeChart.setOption(option, true);
        }
        
        // 切换利润表图表Tab
        function switchIncomeChartTab(chartType, btnElement) {
            currentIncomeChartType = chartType;
            
            // 更新Tab样式
            document.querySelectorAll('#incomeChartsSection .chart-tab').forEach(btn => {
                btn.classList.remove('active');
            });
            btnElement.classList.add('active');
            
            updateIncomeChart();
        }
        
        // 窗口大小改变时重绘图表
        window.addEventListener('resize', function() {
            if (mainChart) mainChart.resize();
            if (incomeChart) incomeChart.resize();
        });
        
        // 加载图表数据
        async function loadChartData(companyCode) {
            if (!companyCode) {
                console.warn('[Chart] No company code provided');
                return;
            }
            
            // 显示加载状态
            const mainChartDom = document.getElementById('mainFinancialChart');
            const incomeChartDom = document.getElementById('incomeChart');
            if (mainChartDom) {
                mainChartDom.innerHTML = '<div class="flex items-center justify-center h-full text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载图表数据中...</div>';
            }
            if (incomeChartDom) {
                incomeChartDom.innerHTML = '<div class="flex items-center justify-center h-full text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>';
            }
            
            try {
                console.log('[Chart] Loading chart data for:', companyCode);
                
                // 添加超时控制
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
                
                const response = await fetch(\`/api/chart/financial/\${companyCode}\`, {
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                const data = await response.json();
                console.log('[Chart] API Response:', data.success, data.error || 'OK');
                
                if (data.success && data.data) {
                    console.log('[Chart] Data loaded - income:', data.data.income?.length, 'fina:', data.data.finaIndicator?.length);
                    
                    // 确保ECharts已加载
                    if (typeof echarts === 'undefined') {
                        console.error('[Chart] ECharts not available');
                        if (mainChartDom) {
                            mainChartDom.innerHTML = '<div class="flex items-center justify-center h-full text-red-400"><i class="fas fa-exclamation-triangle mr-2"></i>图表库未加载</div>';
                        }
                        return;
                    }
                    
                    console.log('[Chart] ECharts available, version:', echarts.version);
                    console.log('[Chart] 准备初始化主图表');
                    
                    // 初始化图表
                    try {
                        initMainChart(data.data);
                        console.log('[Chart] 主图表初始化完成');
                    } catch (err) {
                        console.error('[Chart] 主图表初始化失败:', err);
                        if (mainChartDom) {
                            mainChartDom.innerHTML = '<div class="flex items-center justify-center h-full text-red-400"><i class="fas fa-exclamation-triangle mr-2"></i>图表初始化失败: ' + err.message + '</div>';
                        }
                    }
                } else {
                    console.warn('[Chart] API returned error:', data.error);
                    if (mainChartDom) {
                        mainChartDom.innerHTML = \`<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-exclamation-triangle mr-2"></i>图表数据加载失败: \${data.error || '未知错误'}</div>\`;
                    }
                }
            } catch (error) {
                console.error('[Chart] Error loading chart data:', error);
                const errorMsg = error.name === 'AbortError' ? '请求超时' : (error.message || '网络错误');
                if (mainChartDom) {
                    mainChartDom.innerHTML = \`<div class="flex items-center justify-center h-full text-gray-500"><i class="fas fa-exclamation-triangle mr-2"></i>图表加载失败: \${errorMsg}</div>\`;
                }
            }
        }
        
        // ========== 解析rawResult的辅助函数 ==========
        function parseRawResult(result) {
            if (!result) return {};
            
            // 如果已经有summary，直接返回
            if (result.summary && typeof result.summary === 'object') {
                return result;
            }
            
            // 尝试解析rawResult
            if (result.rawResult) {
                try {
                    let raw = result.rawResult;
                    // 移除markdown代码块
                    if (raw.includes('\`\`\`json')) {
                        raw = raw.replace(/\`\`\`json\\n?/g, '').replace(/\\n?\`\`\`/g, '');
                    }
                    // 尝试直接解析
                    try {
                        const parsed = JSON.parse(raw);
                        console.log('[parseRawResult] Successfully parsed JSON');
                        return parsed;
                    } catch (e) {
                        // JSON被截断，使用高级解析
                        console.log('[parseRawResult] JSON truncated, using advanced parsing');
                        return parsePartialJson(raw);
                    }
                } catch (e) {
                    console.warn('Failed to parse rawResult:', e);
                }
            }
            
            return result;
        }
        
        // ========== 高级JSON部分解析函数 ==========
        function parsePartialJson(raw) {
            const result = { summary: {}, detailedAnalysis: {} };
            
            // 辅助函数：提取字符串字段值
            const extractStringField = (text, field) => {
                // 匹配 "field": "value" 或 "field": "value with \\" escapes"
                const regex = new RegExp(\`"\${field}"\\\\s*:\\\\s*"((?:[^"\\\\\\\\]|\\\\\\\\.)*)"\`, 's');
                const match = text.match(regex);
                return match ? match[1].replace(/\\\\\\\\n/g, ' ').replace(/\\\\\\\\"/g, '"') : null;
            };
            
            // 辅助函数：在detailedAnalysis区域内提取嵌套对象
            const extractNestedObjectInDetail = (text, field) => {
                // 首先找到detailedAnalysis区域
                const detailStart = text.indexOf('"detailedAnalysis"');
                if (detailStart === -1) return null;
                const detailText = text.substring(detailStart);
                
                // 在detailedAnalysis区域内查找目标字段
                const startRegex = new RegExp(\`"\${field}"\\\\s*:\\\\s*\\\\{\`);
                const startMatch = detailText.match(startRegex);
                if (!startMatch) return null;
                
                const startIdx = detailText.indexOf(startMatch[0]) + startMatch[0].length - 1;
                let braceCount = 1;
                let endIdx = startIdx + 1;
                let insideString = false;
                let escapeNext = false;
                
                // 更智能的括号匹配，考虑字符串内的括号
                while (braceCount > 0 && endIdx < detailText.length) {
                    const char = detailText[endIdx];
                    if (escapeNext) {
                        escapeNext = false;
                    } else if (char === '\\\\\\\\') {
                        escapeNext = true;
                    } else if (char === '"' && !escapeNext) {
                        insideString = !insideString;
                    } else if (!insideString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                    }
                    endIdx++;
                }
                
                let objStr = detailText.substring(startIdx, endIdx);
                // 如果括号没闭合，尝试修复截断的字符串和括号
                if (braceCount > 0) {
                    // 查找最后一个未闭合的字符串
                    const lastQuoteIdx = objStr.lastIndexOf('"');
                    const beforeLastQuote = objStr.substring(0, lastQuoteIdx);
                    const quoteCount = (beforeLastQuote.match(/"/g) || []).length;
                    if (quoteCount % 2 === 0) {
                        // 最后一个引号是开始引号，需要闭合字符串
                        objStr = objStr + '"';
                    }
                    objStr += '}'.repeat(braceCount);
                }
                
                try {
                    return JSON.parse(objStr);
                } catch (e) {
                    // 解析失败，手动提取字段
                    const obj = {};
                    const fields = ['trend', 'drivers', 'quality', 'profitCashRatio', 'sustainability',
                                   'grossMarginTrend', 'netMarginTrend', 'costControl',
                                   'composition', 'repaymentPressure', 'financingCost', 'equityRatio',
                                   'retainedEarnings', 'capitalEfficiency', 'efficiency',
                                   'capexAnalysis', 'investmentStrategy', 'dividendPolicy', 'debtManagement',
                                   'industryComparison', 'pricingPower', 'ratio', 'analysis',
                                   'receivablesAnalysis', 'concentration', 'profitCashConsistency',
                                   'assetLiabilityMatch', 'overallAssessment', 'adequacy'];
                    fields.forEach(f => {
                        const val = extractStringField(objStr, f);
                        if (val) obj[f] = val;
                    });
                    return Object.keys(obj).length > 0 ? obj : null;
                }
            };
            
            // ========== 提取summary ==========
            // 首先找到summary区域
            const summaryStart = raw.indexOf('"summary"');
            const detailStart = raw.indexOf('"detailedAnalysis"');
            const summarySection = detailStart > summaryStart ? raw.substring(summaryStart, detailStart) : raw.substring(summaryStart);
            
            const summaryFields = [
                'revenueGrowth', 'grossMargin', 'netMargin', 'profitTrend', 'sustainability', 'oneSentence',
                'operatingCashFlow', 'freeCashFlow', 'cashQuality', 'selfFunding', 'cashFlowHealth',
                'debtRatio', 'currentRatio', 'quickRatio', 'financialHealth', 'cashFlowTrend', 'cashAdequacy',
                'overallQuality', 'cashEarningsRatio', 'cashEarningsMatch', 'revenueQuality', 'financialManipulationRisk'
            ];
            summaryFields.forEach(field => {
                const val = extractStringField(summarySection, field);
                if (val) result.summary[field] = val;
            });
            
            // ========== 提取detailedAnalysis ==========
            // 利润表分析字段
            const revenueAnalysis = extractNestedObjectInDetail(raw, 'revenueAnalysis');
            if (revenueAnalysis) result.detailedAnalysis.revenueAnalysis = revenueAnalysis;
            
            const profitabilityAnalysis = extractNestedObjectInDetail(raw, 'profitabilityAnalysis');
            if (profitabilityAnalysis) result.detailedAnalysis.profitabilityAnalysis = profitabilityAnalysis;
            
            const competitivePosition = extractNestedObjectInDetail(raw, 'competitivePosition');
            if (competitivePosition) result.detailedAnalysis.competitivePosition = competitivePosition;
            
            // 资产负债表分析字段
            const assetStructure = extractNestedObjectInDetail(raw, 'assetStructure');
            if (assetStructure) result.detailedAnalysis.assetStructure = assetStructure;
            
            const liabilityStructure = extractNestedObjectInDetail(raw, 'liabilityStructure');
            if (liabilityStructure) result.detailedAnalysis.liabilityStructure = liabilityStructure;
            
            const capitalStructure = extractNestedObjectInDetail(raw, 'capitalStructure');
            if (capitalStructure) result.detailedAnalysis.capitalStructure = capitalStructure;
            
            // 现金流量表分析字段
            const operatingCashFlow = extractNestedObjectInDetail(raw, 'operatingCashFlow');
            if (operatingCashFlow) result.detailedAnalysis.operatingCashFlow = operatingCashFlow;
            
            const investingCashFlow = extractNestedObjectInDetail(raw, 'investingCashFlow');
            if (investingCashFlow) result.detailedAnalysis.investingCashFlow = investingCashFlow;
            
            const financingCashFlow = extractNestedObjectInDetail(raw, 'financingCashFlow');
            if (financingCashFlow) result.detailedAnalysis.financingCashFlow = financingCashFlow;
            
            const freeCashFlowAnalysis = extractNestedObjectInDetail(raw, 'freeCashFlowAnalysis');
            if (freeCashFlowAnalysis) result.detailedAnalysis.freeCashFlowAnalysis = freeCashFlowAnalysis;
            
            // 盈利质量分析字段
            const cashEarningsAnalysis = extractNestedObjectInDetail(raw, 'cashEarningsAnalysis');
            if (cashEarningsAnalysis) result.detailedAnalysis.cashEarningsAnalysis = cashEarningsAnalysis;
            
            const revenueQualityAnalysis = extractNestedObjectInDetail(raw, 'revenueQualityAnalysis');
            if (revenueQualityAnalysis) result.detailedAnalysis.revenueQualityAnalysis = revenueQualityAnalysis;
            
            const threeStatementLinkage = extractNestedObjectInDetail(raw, 'threeStatementLinkage');
            if (threeStatementLinkage) result.detailedAnalysis.threeStatementLinkage = threeStatementLinkage;
            
            console.log('[parsePartialJson] Extracted summary:', Object.keys(result.summary).length, 'detail:', Object.keys(result.detailedAnalysis).length);
            
            return result;
        }
        
        // ========== 财报数据分析显示函数 ==========
        function displayFinancialAnalysis(report) {
            console.log('[displayFinancialAnalysis] 开始渲染财务分析', {
                hasProfit: !!report.profitabilityResult,
                hasBalance: !!report.balanceSheetResult,
                hasCashFlow: !!report.cashFlowResult,
                hasEQ: !!report.earningsQualityResult,
                companyCode: report.companyCode
            });
            
            // 获取各报表分析结果，并解析rawResult
            const profitability = parseRawResult(report.profitabilityResult || {});
            const balanceSheet = parseRawResult(report.balanceSheetResult || {});
            const cashFlow = parseRawResult(report.cashFlowResult || {});
            const earningsQuality = parseRawResult(report.earningsQualityResult || {});
            
            console.log('[displayFinancialAnalysis] 解析结果', {
                profitSummary: Object.keys(profitability.summary || profitability),
                balanceSummary: Object.keys(balanceSheet.summary || balanceSheet),
                cashFlowSummary: Object.keys(cashFlow.summary || cashFlow)
            });
            
            // ========== 初始化趋势解读 ==========
            if (report.trendInterpretations) {
                console.log('[TrendInterpretation] 初始化趋势解读数据', report.trendInterpretations);
                // 标准化 AI 返回的数据格式（处理 rawResult 格式或其他格式）
                const normalizedInterpretations = normalizeInterpretationData(report.trendInterpretations);
                initTrendInterpretations(normalizedInterpretations);
            } else {
                console.log('[TrendInterpretation] 无趋势解读数据，尝试按需加载');
                showInterpretationLoading();
                // 按需加载趋势解读（针对旧缓存报告）
                if (report.companyCode) {
                    loadTrendInterpretation(report.companyCode);
                }
            }
            
            // ========== 加载图表数据 ==========
            const companyCode = report.companyCode;
            if (companyCode) {
                console.log('[displayFinancialAnalysis] 开始加载图表和行业对比数据:', companyCode);
                loadChartData(companyCode);
                // ========== 加载行业对比数据 ==========
                loadIndustryComparison(companyCode);
            } else {
                console.error('[displayFinancialAnalysis] companyCode为空，无法加载图表');
            }
            
            // 提取摘要和详细分析
            const pSummary = profitability.summary || profitability;
            const pDetail = profitability.detailedAnalysis || {};
            const bSummary = balanceSheet.summary || balanceSheet;
            const bDetail = balanceSheet.detailedAnalysis || {};
            const cSummary = cashFlow.summary || cashFlow;
            const cDetail = cashFlow.detailedAnalysis || {};
            const eqSummary = earningsQuality.summary || earningsQuality;
            const eqDetail = earningsQuality.detailedAnalysis || {};
            

            
            // 财报年份来源和数据来源信息
            const dataSource = report.dataSource || {};
            const reportPeriod = dataSource.latestPeriod || report.reportPeriod || '最新财报';
            const reportPeriods = dataSource.reportPeriods || [];
            const announcementDates = dataSource.announcementDates || [];
            
            // 报告期徽章
            document.getElementById('reportPeriodBadge').innerHTML = \`
                <span class="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                    <i class="fas fa-calendar-alt mr-1"></i>\${reportPeriod}
                </span>
                <a href="https://tushare.pro" target="_blank" class="text-gray-400 hover:text-blue-400 text-xs flex items-center">
                    <i class="fas fa-external-link-alt mr-1"></i>Tushare
                </a>
            \`;
            
            // 数据来源详细信息
            const dataSourceInfo = document.getElementById('dataSourceInfo');
            dataSourceInfo.innerHTML = \`
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-4">
                        <span class="text-gray-400">
                            <i class="fas fa-database mr-1 text-blue-400"></i>
                            数据来源: <a href="https://tushare.pro" target="_blank" class="text-blue-400 hover:underline">\${dataSource.provider || 'Tushare金融数据接口'}</a>
                        </span>
                        <span class="text-gray-500">|</span>
                        <span class="text-gray-400">
                            <i class="fas fa-file-alt mr-1 text-green-400"></i>
                            分析报告期: \${reportPeriods.length > 0 ? reportPeriods.join('、') : reportPeriod}
                        </span>
                    </div>
                    <div class="text-gray-500 italic">
                        <i class="fas fa-exclamation-circle mr-1 text-yellow-500"></i>
                        \${dataSource.disclaimer || '数据仅供参考，不构成投资建议'}
                    </div>
                </div>
                \${announcementDates.length > 0 ? \`
                <div class="mt-2 pt-2 border-t border-gray-700/50">
                    <span class="text-gray-500">
                        <i class="fas fa-bullhorn mr-1"></i>公告日期: \${announcementDates.slice(0, 3).map(d => d ? d.substring(0, 4) + '-' + d.substring(4, 6) + '-' + d.substring(6, 8) : '').join('、')}
                    </span>
                </div>
                \` : ''}
            \`;
            
            // 核心指标概览
            const metricsOverview = document.getElementById('financialMetricsOverview');
            metricsOverview.innerHTML = \`
                <div class="bg-green-900/20 p-3 rounded-lg border border-green-800/30">
                    <div class="text-xs text-green-400 mb-1">营收增长</div>
                    <div class="text-xl font-bold text-green-300">\${pSummary.revenueGrowth || '--'}</div>
                </div>
                <div class="bg-blue-900/20 p-3 rounded-lg border border-blue-800/30">
                    <div class="text-xs text-blue-400 mb-1">资产负债率</div>
                    <div class="text-xl font-bold text-blue-300">\${bSummary.debtRatio || '--'}</div>
                </div>
                <div class="bg-purple-900/20 p-3 rounded-lg border border-purple-800/30">
                    <div class="text-xs text-purple-400 mb-1">经营现金流</div>
                    <div class="text-xl font-bold text-purple-300">\${cSummary.operatingCashFlow || cSummary.cashFlowHealth || '--'}</div>
                </div>
                <div class="bg-orange-900/20 p-3 rounded-lg border border-orange-800/30">
                    <div class="text-xs text-orange-400 mb-1">盈利质量</div>
                    <div class="text-xl font-bold \${eqSummary.overallQuality === '高' || eqSummary.overallQuality === '优秀' ? 'text-green-300' : 'text-orange-300'}">\${eqSummary.overallQuality || '--'}</div>
                </div>
            \`;
            
            // 利润表分析卡片
            const incomeContent = document.getElementById('incomeStatementContent');
            incomeContent.innerHTML = \`
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">毛利率</span>
                        <span class="text-green-300 font-semibold">\${pSummary.grossMargin || '--'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">净利率</span>
                        <span class="text-green-300 font-semibold">\${pSummary.netMargin || '--'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">可持续性</span>
                        <span class="\${pSummary.sustainability === '高' ? 'text-green-400' : 'text-yellow-400'}">\${pSummary.sustainability || '--'}</span>
                    </div>
                </div>
                \${pSummary.oneSentence ? \`<p class="text-xs text-gray-400 mt-3 italic border-t border-gray-700 pt-2">\${pSummary.oneSentence}</p>\` : ''}
            \`;
            
            // 资产负债表分析卡片
            const balanceContent = document.getElementById('balanceSheetContent');
            balanceContent.innerHTML = \`
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">流动比率</span>
                        <span class="text-blue-300 font-semibold">\${bSummary.currentRatio || '--'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">速动比率</span>
                        <span class="text-blue-300 font-semibold">\${bSummary.quickRatio || '--'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">财务健康</span>
                        <span class="\${bSummary.financialHealth === '优秀' || bSummary.financialHealth === '良好' ? 'text-green-400' : 'text-yellow-400'}">\${bSummary.financialHealth || '--'}</span>
                    </div>
                </div>
                \${bSummary.oneSentence ? \`<p class="text-xs text-gray-400 mt-3 italic border-t border-gray-700 pt-2">\${bSummary.oneSentence}</p>\` : ''}
            \`;
            
            // 现金流量表分析卡片
            const cashFlowContentEl = document.getElementById('cashFlowContent');
            cashFlowContentEl.innerHTML = \`
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">自由现金流</span>
                        <span class="text-purple-300 font-semibold">\${cSummary.freeCashFlow || '--'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">现金流趋势</span>
                        <span class="\${cSummary.cashFlowTrend === '改善' ? 'text-green-400' : cSummary.cashFlowTrend === '恶化' ? 'text-red-400' : 'text-yellow-400'}">\${cSummary.cashFlowTrend || '--'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500 text-xs">现金充裕度</span>
                        <span class="text-purple-300">\${cSummary.cashAdequacy || '--'}</span>
                    </div>
                </div>
                \${cSummary.oneSentence ? \`<p class="text-xs text-gray-400 mt-3 italic border-t border-gray-700 pt-2">\${cSummary.oneSentence}</p>\` : ''}
            \`;
            
            // 三表联动分析
            const linkageContent = document.getElementById('linkageContent');
            const linkageAnalysis = eqDetail.threeStatementLinkage || eqSummary;
            linkageContent.innerHTML = \`
                <div class="grid md:grid-cols-3 gap-4 mb-3">
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full \${eqSummary.cashEarningsRatio === '健康' || eqSummary.cashEarningsMatch === '匹配' ? 'bg-green-500' : 'bg-yellow-500'} mr-2"></div>
                        <div>
                            <div class="text-xs text-gray-500">现金/利润匹配</div>
                            <div class="text-sm \${eqSummary.cashEarningsRatio === '健康' || eqSummary.cashEarningsMatch === '匹配' ? 'text-green-400' : 'text-yellow-400'}">\${eqSummary.cashEarningsRatio || eqSummary.cashEarningsMatch || '--'}</div>
                        </div>
                    </div>
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full \${eqSummary.revenueQuality === '高' || eqSummary.revenueQuality === '真实' ? 'bg-green-500' : 'bg-yellow-500'} mr-2"></div>
                        <div>
                            <div class="text-xs text-gray-500">营收质量</div>
                            <div class="text-sm \${eqSummary.revenueQuality === '高' || eqSummary.revenueQuality === '真实' ? 'text-green-400' : 'text-yellow-400'}">\${eqSummary.revenueQuality || '--'}</div>
                        </div>
                    </div>
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full \${eqSummary.financialManipulationRisk === '低' ? 'bg-green-500' : eqSummary.financialManipulationRisk === '中' ? 'bg-yellow-500' : 'bg-red-500'} mr-2"></div>
                        <div>
                            <div class="text-xs text-gray-500">财务操纵风险</div>
                            <div class="text-sm \${eqSummary.financialManipulationRisk === '低' ? 'text-green-400' : eqSummary.financialManipulationRisk === '中' ? 'text-yellow-400' : 'text-red-400'}">\${eqSummary.financialManipulationRisk || '--'}</div>
                        </div>
                    </div>
                </div>
                \${eqSummary.oneSentence ? \`<p class="text-sm text-gray-300 italic">\${eqSummary.oneSentence}</p>\` : ''}
                \${linkageAnalysis.profitCashConsistency ? \`<p class="text-xs text-gray-500 mt-2">利润现金一致性: \${linkageAnalysis.profitCashConsistency}</p>\` : ''}
            \`;
            
            // 专业深度解读
            const detailedContent = document.getElementById('financialDetailedContent');
            let detailHtml = '';
            
            // 利润表深度分析 - 始终显示（使用pSummary数据生成指标卡片）
            const showProfitDetail = pDetail.revenueAnalysis || pDetail.profitabilityAnalysis || pSummary.grossMargin || pSummary.netMargin;
            if (showProfitDetail) {
                // 从pSummary生成利润表关键指标
                const profitKeyMetrics = [];
                if (pSummary.grossMargin) {
                    profitKeyMetrics.push({ name: '毛利率', value: pSummary.grossMargin, benchmark: '行业平均30-50%' });
                }
                if (pSummary.netMargin) {
                    profitKeyMetrics.push({ name: '净利率', value: pSummary.netMargin, benchmark: '行业平均10-20%' });
                }
                if (pSummary.revenueGrowth) {
                    profitKeyMetrics.push({ name: '营收增长率', value: pSummary.revenueGrowth, benchmark: '行业平均5-15%' });
                }
                if (pSummary.sustainability) {
                    profitKeyMetrics.push({ name: '盈利可持续性', value: pSummary.sustainability, benchmark: '高为优' });
                }
                
                detailHtml += \`
                <div class="bg-green-900/10 p-4 rounded-lg border border-green-800/30">
                    <h4 class="font-semibold text-green-400 mb-3 flex items-center">
                        <i class="fas fa-chart-line mr-2"></i>利润表深度分析
                    </h4>
                    \${pDetail.revenueAnalysis ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span>营收分析
                        </div>
                        \${pDetail.revenueAnalysis.trend ? \`<p class="text-gray-300 text-sm mb-2">\${pDetail.revenueAnalysis.trend}</p>\` : ''}
                        \${pDetail.revenueAnalysis.drivers ? \`<p class="text-gray-400 text-sm mb-2"><strong>驱动因素:</strong> \${pDetail.revenueAnalysis.drivers}</p>\` : ''}
                        \${pDetail.revenueAnalysis.quality ? \`<p class="text-gray-400 text-sm"><strong>营收质量:</strong> \${pDetail.revenueAnalysis.quality}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${pDetail.profitabilityAnalysis ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span>盈利能力分析
                        </div>
                        \${pDetail.profitabilityAnalysis.grossMarginTrend ? \`<p class="text-gray-300 text-sm mb-2">\${pDetail.profitabilityAnalysis.grossMarginTrend}</p>\` : ''}
                        \${pDetail.profitabilityAnalysis.netMarginTrend ? \`<p class="text-gray-400 text-sm mb-2">\${pDetail.profitabilityAnalysis.netMarginTrend}</p>\` : ''}
                        \${pDetail.profitabilityAnalysis.costControl ? \`<p class="text-gray-400 text-sm"><strong>成本控制:</strong> \${pDetail.profitabilityAnalysis.costControl}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${pDetail.competitivePosition ? \`
                    <div class="p-3 bg-gray-800/50 rounded border-l-2 border-green-500 mb-4">
                        <div class="text-xs text-gray-500 mb-1">竞争地位</div>
                        <p class="text-sm text-gray-300">\${pDetail.competitivePosition.industryComparison || ''}</p>
                        \${pDetail.competitivePosition.pricingPower ? \`<p class="text-xs text-green-400 mt-1">定价能力: \${pDetail.competitivePosition.pricingPower}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${profitKeyMetrics.length > 0 ? \`
                    <div class="mt-4 pt-4 border-t border-gray-700">
                        <div class="text-xs text-gray-500 mb-2">关键指标对比</div>
                        <div class="grid grid-cols-2 gap-2">
                            \${profitKeyMetrics.map(m => \`
                            <div class="bg-gray-800/30 p-2 rounded text-xs">
                                <div class="text-gray-500">\${m.name}</div>
                                <div class="text-green-300 font-semibold">\${m.value}</div>
                                <div class="text-gray-600">基准: \${m.benchmark}</div>
                            </div>
                            \`).join('')}
                        </div>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            // 资产负债表深度分析
            if (bDetail.assetStructure || bDetail.liabilityStructure || bDetail.capitalStructure) {
                detailHtml += \`
                <div class="bg-blue-900/10 p-4 rounded-lg border border-blue-800/30">
                    <h4 class="font-semibold text-blue-400 mb-3 flex items-center">
                        <i class="fas fa-balance-scale mr-2"></i>资产负债表深度分析
                    </h4>
                    \${bDetail.assetStructure ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>资产结构
                        </div>
                        \${bDetail.assetStructure.composition ? \`<p class="text-gray-300 text-sm mb-2">\${bDetail.assetStructure.composition}</p>\` : ''}
                        \${bDetail.assetStructure.quality ? \`<p class="text-gray-400 text-sm mb-2"><strong>资产质量:</strong> \${bDetail.assetStructure.quality}</p>\` : ''}
                        \${bDetail.assetStructure.efficiency ? \`<p class="text-gray-400 text-sm"><strong>周转效率:</strong> \${bDetail.assetStructure.efficiency}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${bDetail.liabilityStructure ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>负债结构
                        </div>
                        \${bDetail.liabilityStructure.composition ? \`<p class="text-gray-300 text-sm mb-2">\${bDetail.liabilityStructure.composition}</p>\` : ''}
                        \${bDetail.liabilityStructure.repaymentPressure ? \`<p class="text-gray-400 text-sm mb-2"><strong>偿债压力:</strong> \${bDetail.liabilityStructure.repaymentPressure}</p>\` : ''}
                        \${bDetail.liabilityStructure.financingCost ? \`<p class="text-gray-400 text-sm"><strong>融资成本:</strong> \${bDetail.liabilityStructure.financingCost}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${bDetail.capitalStructure ? \`
                    <div class="p-3 bg-gray-800/50 rounded border-l-2 border-blue-500">
                        <div class="text-xs text-gray-500 mb-1">资本结构</div>
                        \${bDetail.capitalStructure.equityRatio ? \`<p class="text-sm text-gray-300">股东权益: \${bDetail.capitalStructure.equityRatio}</p>\` : ''}
                        \${bDetail.capitalStructure.retainedEarnings ? \`<p class="text-xs text-gray-400 mt-1">留存收益: \${bDetail.capitalStructure.retainedEarnings}</p>\` : ''}
                        \${bDetail.capitalStructure.capitalEfficiency ? \`<p class="text-xs text-blue-400 mt-1">资本效率: \${bDetail.capitalStructure.capitalEfficiency}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${balanceSheet.keyMetrics && balanceSheet.keyMetrics.length > 0 ? \`
                    <div class="mt-4">
                        <div class="text-xs text-gray-500 mb-2">关键指标对比</div>
                        <div class="grid grid-cols-2 gap-2">
                            \${balanceSheet.keyMetrics.slice(0, 4).map(m => \`
                            <div class="bg-gray-800/30 p-2 rounded text-xs">
                                <div class="text-gray-500">\${m.name}</div>
                                <div class="text-blue-300 font-semibold">\${m.value}</div>
                                <div class="text-gray-600">基准: \${m.benchmark || '--'}</div>
                            </div>
                            \`).join('')}
                        </div>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            // 现金流量表深度分析 - 始终显示（使用cSummary数据生成指标卡片）
            const showCashFlowDetail = cDetail.operatingCashFlow || cDetail.investingCashFlow || cDetail.financingCashFlow || cSummary.operatingCashFlow || cSummary.freeCashFlow;
            if (showCashFlowDetail) {
                // 从cSummary生成现金流关键指标
                const cashFlowKeyMetrics = [];
                if (cSummary.operatingCashFlow) {
                    cashFlowKeyMetrics.push({ name: '经营现金流', value: cSummary.operatingCashFlow, benchmark: '充裕为优' });
                }
                if (cSummary.freeCashFlow) {
                    cashFlowKeyMetrics.push({ name: '自由现金流', value: cSummary.freeCashFlow, benchmark: '充裕为优' });
                }
                if (cSummary.cashQuality) {
                    cashFlowKeyMetrics.push({ name: '现金流质量', value: cSummary.cashQuality, benchmark: '优秀/良好' });
                }
                if (cSummary.selfFunding) {
                    cashFlowKeyMetrics.push({ name: '自筹能力', value: cSummary.selfFunding, benchmark: '强为优' });
                }
                
                detailHtml += \`
                <div class="bg-purple-900/10 p-4 rounded-lg border border-purple-800/30">
                    <h4 class="font-semibold text-purple-400 mb-3 flex items-center">
                        <i class="fas fa-money-bill-wave mr-2"></i>现金流量表深度分析
                    </h4>
                    \${cDetail.operatingCashFlow ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>经营活动现金流
                        </div>
                        \${cDetail.operatingCashFlow.trend ? \`<p class="text-gray-300 text-sm mb-2">\${cDetail.operatingCashFlow.trend}</p>\` : ''}
                        \${cDetail.operatingCashFlow.profitCashRatio ? \`<p class="text-gray-400 text-sm mb-2"><strong>利润现金比:</strong> \${cDetail.operatingCashFlow.profitCashRatio}</p>\` : ''}
                        \${cDetail.operatingCashFlow.quality ? \`<p class="text-gray-400 text-sm mb-2"><strong>现金流质量:</strong> \${cDetail.operatingCashFlow.quality}</p>\` : ''}
                        \${cDetail.operatingCashFlow.sustainability ? \`<p class="text-gray-400 text-sm"><strong>可持续性:</strong> \${cDetail.operatingCashFlow.sustainability}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${cDetail.investingCashFlow ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>投资活动现金流
                        </div>
                        \${cDetail.investingCashFlow.capexAnalysis ? \`<p class="text-gray-300 text-sm mb-2"><strong>资本支出:</strong> \${cDetail.investingCashFlow.capexAnalysis}</p>\` : ''}
                        \${cDetail.investingCashFlow.investmentStrategy ? \`<p class="text-gray-400 text-sm"><strong>投资策略:</strong> \${cDetail.investingCashFlow.investmentStrategy}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${cDetail.financingCashFlow ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>筹资活动现金流
                        </div>
                        \${cDetail.financingCashFlow.dividendPolicy ? \`<p class="text-gray-300 text-sm mb-2"><strong>分红政策:</strong> \${cDetail.financingCashFlow.dividendPolicy}</p>\` : ''}
                        \${cDetail.financingCashFlow.debtManagement ? \`<p class="text-gray-400 text-sm"><strong>债务管理:</strong> \${cDetail.financingCashFlow.debtManagement}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${cDetail.freeCashFlowAnalysis ? \`
                    <div class="p-3 bg-gray-800/50 rounded border-l-2 border-purple-500 mb-4">
                        <div class="text-xs text-gray-500 mb-1">自由现金流分析</div>
                        <p class="text-sm text-gray-300">\${cDetail.freeCashFlowAnalysis.trend || cDetail.freeCashFlowAnalysis}</p>
                        \${cDetail.freeCashFlowAnalysis.adequacy ? \`<p class="text-xs text-purple-400 mt-1">充裕度: \${cDetail.freeCashFlowAnalysis.adequacy}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${cashFlowKeyMetrics.length > 0 ? \`
                    <div class="mt-4 pt-4 border-t border-gray-700">
                        <div class="text-xs text-gray-500 mb-2">关键指标对比</div>
                        <div class="grid grid-cols-2 gap-2">
                            \${cashFlowKeyMetrics.map(m => \`
                            <div class="bg-gray-800/30 p-2 rounded text-xs">
                                <div class="text-gray-500">\${m.name}</div>
                                <div class="text-purple-300 font-semibold">\${m.value}</div>
                                <div class="text-gray-600">基准: \${m.benchmark}</div>
                            </div>
                            \`).join('')}
                        </div>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            // 三表联动深度分析
            if (eqDetail.threeStatementLinkage || eqDetail.cashEarningsAnalysis || eqDetail.revenueQualityAnalysis) {
                detailHtml += \`
                <div class="bg-orange-900/10 p-4 rounded-lg border border-orange-800/30">
                    <h4 class="font-semibold text-orange-400 mb-3 flex items-center">
                        <i class="fas fa-link mr-2"></i>三表联动深度分析（盈利质量验证）
                    </h4>
                    \${eqDetail.cashEarningsAnalysis ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>现金利润匹配分析
                        </div>
                        \${eqDetail.cashEarningsAnalysis.ratio ? \`<p class="text-gray-300 text-sm mb-2"><strong>现金利润比:</strong> \${eqDetail.cashEarningsAnalysis.ratio}</p>\` : ''}
                        \${eqDetail.cashEarningsAnalysis.analysis ? \`<p class="text-gray-400 text-sm">\${eqDetail.cashEarningsAnalysis.analysis}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${eqDetail.revenueQualityAnalysis ? \`
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2 flex items-center">
                            <span class="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>营收质量分析
                        </div>
                        \${eqDetail.revenueQualityAnalysis.receivablesAnalysis ? \`<p class="text-gray-300 text-sm mb-2"><strong>应收账款:</strong> \${eqDetail.revenueQualityAnalysis.receivablesAnalysis}</p>\` : ''}
                        \${eqDetail.revenueQualityAnalysis.concentration ? \`<p class="text-gray-400 text-sm"><strong>客户集中度:</strong> \${eqDetail.revenueQualityAnalysis.concentration}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${eqDetail.threeStatementLinkage ? \`
                    <div class="p-3 bg-gray-800/50 rounded border-l-2 border-orange-500">
                        <div class="text-xs text-gray-500 mb-1">三表联动验证</div>
                        \${eqDetail.threeStatementLinkage.profitCashConsistency ? \`<p class="text-sm text-gray-300 mb-1">利润现金一致性: \${eqDetail.threeStatementLinkage.profitCashConsistency}</p>\` : ''}
                        \${eqDetail.threeStatementLinkage.assetLiabilityMatch ? \`<p class="text-sm text-gray-300 mb-1">资产负债匹配: \${eqDetail.threeStatementLinkage.assetLiabilityMatch}</p>\` : ''}
                        \${eqDetail.threeStatementLinkage.overallAssessment ? \`<p class="text-xs text-orange-400 mt-2">\${eqDetail.threeStatementLinkage.overallAssessment}</p>\` : ''}
                    </div>
                    \` : ''}
                    \${earningsQuality.redFlags && earningsQuality.redFlags.length > 0 ? \`
                    <div class="mt-4 p-3 bg-red-900/20 rounded border-l-2 border-red-500">
                        <div class="text-xs text-red-400 mb-2">财务预警信号</div>
                        <ul class="space-y-1">
                            \${earningsQuality.redFlags.map(f => \`<li class="text-sm text-gray-400 flex items-start"><i class="fas fa-exclamation-triangle text-red-500 mr-2 mt-0.5 text-xs"></i>\${f}</li>\`).join('')}
                        </ul>
                    </div>
                    \` : ''}
                </div>
                \`;
            }
            
            detailedContent.innerHTML = detailHtml || '<p class="text-gray-500 text-sm">暂无详细分析数据，请等待分析完成</p>';
        }
        
        // ========== 风险评估显示函数 ==========
        function displayRiskAnalysis(report) {
            const risk = report.riskResult || {};
            const rSummary = risk.summary || risk;
            const rDetail = risk.detailedAnalysis || {};
            
            const parseRisk = (val) => {
                if (!val) return '--';
                return val.replace(/^(负债风险|流动性风险|运营风险|综合风险评级)[：:]/g, '').trim();
            };
            
            const getRiskColor = (level) => {
                if (level === '安全' || level === 'low' || level === '低') return 'text-green-400';
                if (level === '适中' || level === 'moderate' || level === '中') return 'text-yellow-400';
                return 'text-red-400';
            };
            
            const getRiskBgColor = (level) => {
                if (level === '安全' || level === 'low' || level === '低') return 'bg-green-600';
                if (level === '适中' || level === 'moderate' || level === '中') return 'bg-yellow-500';
                return 'bg-red-500';
            };
            
            // 综合风险等级徽章
            const overallRisk = parseRisk(rSummary.overallRisk);
            const riskBadge = document.getElementById('overallRiskBadge');
            riskBadge.className = \`px-4 py-1 rounded-full text-sm font-semibold \${getRiskBgColor(overallRisk)} text-white\`;
            riskBadge.innerHTML = \`<i class="fas fa-shield-alt mr-1"></i>综合: \${overallRisk}\`;
            
            // 风险评估内容
            const riskContent = document.getElementById('riskContent');
            let riskHtml = '';
            
            if (rSummary.overallRisk || rSummary.debtRisk) {
                riskHtml = \`
                    <!-- 风险指标网格 -->
                    <div class="grid md:grid-cols-4 gap-3 mb-4">
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">负债风险</div>
                            <div class="text-lg font-semibold \${getRiskColor(parseRisk(rSummary.debtRisk))}">\${parseRisk(rSummary.debtRisk)}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">流动性风险</div>
                            <div class="text-lg font-semibold \${getRiskColor(parseRisk(rSummary.liquidityRisk))}">\${parseRisk(rSummary.liquidityRisk)}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">运营风险</div>
                            <div class="text-lg font-semibold \${getRiskColor(parseRisk(rSummary.operationalRisk))}">\${parseRisk(rSummary.operationalRisk)}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">杠杆风险</div>
                            <div class="text-lg font-semibold \${getRiskColor(parseRisk(rSummary.leverageRisk))}">\${parseRisk(rSummary.leverageRisk) || '--'}</div>
                        </div>
                    </div>
                    
                    <!-- 风险摘要 -->
                    \${rSummary.oneSentence ? \`
                    <div class="p-3 bg-gray-800/30 rounded-lg border-l-2 border-red-500 mb-4">
                        <p class="text-gray-300">\${rSummary.oneSentence}</p>
                    </div>
                    \` : ''}
                    
                    <!-- 详细风险分析展开 -->
                    <details class="group mt-4">
                        <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-red-600/20 to-red-500/10 border border-red-600/50 rounded-lg hover:from-red-600/30 hover:to-red-500/20 transition-all flex items-center justify-between">
                            <span class="flex items-center text-red-400 font-semibold">
                                <i class="fas fa-exclamation-triangle mr-2"></i>
                                查看详细风险分析
                            </span>
                            <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-red-500"></i>
                        </summary>
                        <div class="mt-4 space-y-4 border-t border-gray-700 pt-4">
                            \${rDetail.debtRisk ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-red-400 mb-2 flex items-center">
                                    <i class="fas fa-building mr-2"></i>负债风险详情
                                </h5>
                                \${rDetail.debtRisk.analysis ? \`<p class="text-gray-300 text-sm mb-2">\${rDetail.debtRisk.analysis}</p>\` : ''}
                                \${rDetail.debtRisk.debtToEquity ? \`<p class="text-gray-400 text-sm">资产负债率: \${rDetail.debtRisk.debtToEquity}</p>\` : ''}
                                \${rDetail.debtRisk.interestCoverage ? \`<p class="text-gray-400 text-sm">利息保障倍数: \${rDetail.debtRisk.interestCoverage}</p>\` : ''}
                            </div>
                            \` : ''}
                            \${rDetail.liquidityRisk ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-yellow-400 mb-2 flex items-center">
                                    <i class="fas fa-tint mr-2"></i>流动性风险详情
                                </h5>
                                \${rDetail.liquidityRisk.analysis ? \`<p class="text-gray-300 text-sm mb-2">\${rDetail.liquidityRisk.analysis}</p>\` : ''}
                                \${rDetail.liquidityRisk.currentRatio ? \`<p class="text-gray-400 text-sm">流动比率: \${rDetail.liquidityRisk.currentRatio}</p>\` : ''}
                                \${rDetail.liquidityRisk.quickRatio ? \`<p class="text-gray-400 text-sm">速动比率: \${rDetail.liquidityRisk.quickRatio}</p>\` : ''}
                            </div>
                            \` : ''}
                            \${rDetail.operationalRisk ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-orange-400 mb-2 flex items-center">
                                    <i class="fas fa-cogs mr-2"></i>运营风险详情
                                </h5>
                                \${rDetail.operationalRisk.analysis ? \`<p class="text-gray-300 text-sm mb-2">\${rDetail.operationalRisk.analysis}</p>\` : ''}
                                \${rDetail.operationalRisk.inventoryRisk ? \`<p class="text-gray-400 text-sm">存货风险: \${rDetail.operationalRisk.inventoryRisk}</p>\` : ''}
                                \${rDetail.operationalRisk.receivablesRisk ? \`<p class="text-gray-400 text-sm">应收账款风险: \${rDetail.operationalRisk.receivablesRisk}</p>\` : ''}
                            </div>
                            \` : ''}
                            \${rDetail.marketRisk ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-purple-400 mb-2 flex items-center">
                                    <i class="fas fa-chart-bar mr-2"></i>市场风险
                                </h5>
                                \${rDetail.marketRisk.cyclicality ? \`<p class="text-gray-300 text-sm mb-2">周期性: \${rDetail.marketRisk.cyclicality}</p>\` : ''}
                                \${rDetail.marketRisk.competition ? \`<p class="text-gray-400 text-sm">竞争风险: \${rDetail.marketRisk.competition}</p>\` : ''}
                                \${rDetail.marketRisk.regulation ? \`<p class="text-gray-400 text-sm">监管风险: \${rDetail.marketRisk.regulation}</p>\` : ''}
                            </div>
                            \` : ''}
                            \${risk.riskFactors && risk.riskFactors.length > 0 ? \`
                            <div class="bg-red-900/20 p-4 rounded-lg border border-red-800/30">
                                <h5 class="font-semibold text-red-400 mb-2 flex items-center">
                                    <i class="fas fa-exclamation-triangle mr-2"></i>主要风险因素
                                </h5>
                                <ul class="space-y-2">
                                    \${risk.riskFactors.map(f => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-circle text-red-500 mr-2 mt-1.5 text-xs"></i>\${f}</li>\`).join('')}
                                </ul>
                            </div>
                            \` : ''}
                            \${risk.mitigationFactors && risk.mitigationFactors.length > 0 ? \`
                            <div class="bg-green-900/20 p-4 rounded-lg border border-green-800/30">
                                <h5 class="font-semibold text-green-400 mb-2 flex items-center">
                                    <i class="fas fa-shield-alt mr-2"></i>风险缓释因素
                                </h5>
                                <ul class="space-y-2">
                                    \${risk.mitigationFactors.map(f => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-check text-green-500 mr-2 mt-1"></i>\${f}</li>\`).join('')}
                                </ul>
                            </div>
                            \` : ''}
                        </div>
                    </details>
                \`;
            } else {
                riskHtml = \`
                    <div class="grid md:grid-cols-3 gap-3">
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">负债风险:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">流动性风险:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">运营风险:</span> <span class="text-gray-400">--</span></div>
                    </div>
                    <p class="text-gray-500 text-sm mt-4">风险分析数据加载中...</p>
                \`;
            }
            
            riskContent.innerHTML = riskHtml;
        }
        
        // ========== 估值评估显示函数 ==========
        function displayValuationAnalysis(report) {
            const valuation = report.valuationResult || {};
            const vSummary = valuation.summary || {};
            const relativeVal = valuation.relativeValuation || {};
            const intrinsicVal = valuation.intrinsicValue || {};
            const marketSentiment = valuation.marketSentiment || {};
            const investImpl = valuation.investmentImplication || {};
            
            // 估值评估颜色函数
            const getValuationColor = (assessment) => {
                if (!assessment) return 'text-gray-400';
                if (assessment === '低估' || assessment.includes('低估')) return 'text-green-400';
                if (assessment === '合理' || assessment.includes('合理')) return 'text-blue-400';
                if (assessment === '高估' || assessment.includes('高估')) return 'text-yellow-400';
                if (assessment === '严重高估' || assessment.includes('严重')) return 'text-red-400';
                return 'text-gray-400';
            };
            
            const getValuationBgColor = (assessment) => {
                if (!assessment) return 'bg-gray-600';
                if (assessment === '低估' || assessment.includes('低估')) return 'bg-green-600';
                if (assessment === '合理' || assessment.includes('合理')) return 'bg-blue-600';
                if (assessment === '高估' || assessment.includes('高估')) return 'bg-yellow-500';
                if (assessment === '严重高估' || assessment.includes('严重')) return 'bg-red-500';
                return 'bg-gray-600';
            };
            
            const getAttractiveBadge = (isAttractive) => {
                if (isAttractive === true) return '<span class="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">具吸引力</span>';
                if (isAttractive === false) return '<span class="px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded">偏高</span>';
                return '';
            };
            
            // 估值结论徽章
            const overallAssessment = vSummary.overallAssessment || '数据加载中';
            const valuationBadge = document.getElementById('valuationBadge');
            if (valuationBadge) {
                valuationBadge.className = \`px-4 py-1 rounded-full text-sm font-semibold \${getValuationBgColor(overallAssessment)} text-white\`;
                valuationBadge.innerHTML = \`<i class="fas fa-chart-line mr-1"></i>\${overallAssessment}\`;
            }
            
            // 估值评估内容
            const valuationContent = document.getElementById('valuationContent');
            let valuationHtml = '';
            
            if (vSummary.currentPE || vSummary.currentPB || vSummary.marketCap) {
                valuationHtml = \`
                    <!-- 核心估值指标网格 -->
                    <div class="grid md:grid-cols-4 gap-3 mb-4">
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">PE (TTM)</div>
                            <div class="text-lg font-semibold text-purple-400">\${vSummary.currentPE || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">PB</div>
                            <div class="text-lg font-semibold text-blue-400">\${vSummary.currentPB || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">PS (TTM)</div>
                            <div class="text-lg font-semibold text-cyan-400">\${vSummary.currentPS || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">总市值</div>
                            <div class="text-lg font-semibold text-yellow-400">\${vSummary.marketCap || '--'}</div>
                        </div>
                    </div>
                    
                    <!-- 估值摘要 -->
                    \${vSummary.oneSentence ? \`
                    <div class="p-3 bg-gray-800/30 rounded-lg border-l-2 border-purple-500 mb-4">
                        <p class="text-gray-300">\${vSummary.oneSentence}</p>
                    </div>
                    \` : ''}
                    
                    <!-- 投资建议摘要 -->
                    \${investImpl.suggestedAction ? \`
                    <div class="grid md:grid-cols-3 gap-3 mb-4">
                        <div class="bg-purple-900/20 p-3 rounded-lg border border-purple-700/30">
                            <div class="text-xs text-gray-500 mb-1">操作建议</div>
                            <div class="text-lg font-semibold \${getValuationColor(investImpl.suggestedAction)}">\${investImpl.suggestedAction}</div>
                        </div>
                        \${investImpl.upside ? \`
                        <div class="bg-green-900/20 p-3 rounded-lg border border-green-700/30">
                            <div class="text-xs text-gray-500 mb-1">潜在涨幅</div>
                            <div class="text-lg font-semibold text-green-400">\${investImpl.upside}</div>
                        </div>
                        \` : ''}
                        \${investImpl.timeHorizon ? \`
                        <div class="bg-blue-900/20 p-3 rounded-lg border border-blue-700/30">
                            <div class="text-xs text-gray-500 mb-1">建议持有期</div>
                            <div class="text-lg font-semibold text-blue-400">\${investImpl.timeHorizon}</div>
                        </div>
                        \` : ''}
                    </div>
                    \` : ''}
                    
                    <!-- 详细估值分析展开 -->
                    <details class="group mt-4">
                        <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-purple-600/20 to-purple-500/10 border border-purple-600/50 rounded-lg hover:from-purple-600/30 hover:to-purple-500/20 transition-all flex items-center justify-between">
                            <span class="flex items-center text-purple-400 font-semibold">
                                <i class="fas fa-calculator mr-2"></i>
                                查看详细估值分析
                            </span>
                            <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-purple-500"></i>
                        </summary>
                        <div class="mt-4 space-y-4 border-t border-gray-700 pt-4">
                            <!-- 相对估值分析 -->
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-purple-400 mb-3 flex items-center">
                                    <i class="fas fa-balance-scale mr-2"></i>相对估值分析
                                </h5>
                                <div class="grid md:grid-cols-3 gap-4">
                                    \${relativeVal.peAnalysis ? \`
                                    <div class="bg-gray-900/50 p-3 rounded-lg">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-sm text-gray-400">PE分析</span>
                                            \${getAttractiveBadge(relativeVal.peAnalysis.isAttractive)}
                                        </div>
                                        <div class="text-xs text-gray-500 space-y-1">
                                            <p>当前: <span class="text-purple-400">\${relativeVal.peAnalysis.current || '--'}</span></p>
                                            <p>历史均值: \${relativeVal.peAnalysis.historicalAvg || '--'}</p>
                                            <p>行业均值: \${relativeVal.peAnalysis.industryAvg || '--'}</p>
                                        </div>
                                        \${relativeVal.peAnalysis.assessment ? \`<p class="text-gray-400 text-xs mt-2">\${relativeVal.peAnalysis.assessment}</p>\` : ''}
                                    </div>
                                    \` : ''}
                                    \${relativeVal.pbAnalysis ? \`
                                    <div class="bg-gray-900/50 p-3 rounded-lg">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-sm text-gray-400">PB分析</span>
                                            \${getAttractiveBadge(relativeVal.pbAnalysis.isAttractive)}
                                        </div>
                                        <div class="text-xs text-gray-500 space-y-1">
                                            <p>当前: <span class="text-blue-400">\${relativeVal.pbAnalysis.current || '--'}</span></p>
                                            <p>历史均值: \${relativeVal.pbAnalysis.historicalAvg || '--'}</p>
                                            <p>行业均值: \${relativeVal.pbAnalysis.industryAvg || '--'}</p>
                                        </div>
                                        \${relativeVal.pbAnalysis.assessment ? \`<p class="text-gray-400 text-xs mt-2">\${relativeVal.pbAnalysis.assessment}</p>\` : ''}
                                    </div>
                                    \` : ''}
                                    \${relativeVal.psAnalysis ? \`
                                    <div class="bg-gray-900/50 p-3 rounded-lg">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="text-sm text-gray-400">PS分析</span>
                                            \${getAttractiveBadge(relativeVal.psAnalysis.isAttractive)}
                                        </div>
                                        <div class="text-xs text-gray-500 space-y-1">
                                            <p>当前: <span class="text-cyan-400">\${relativeVal.psAnalysis.current || '--'}</span></p>
                                            <p>历史均值: \${relativeVal.psAnalysis.historicalAvg || '--'}</p>
                                            <p>行业均值: \${relativeVal.psAnalysis.industryAvg || '--'}</p>
                                        </div>
                                        \${relativeVal.psAnalysis.assessment ? \`<p class="text-gray-400 text-xs mt-2">\${relativeVal.psAnalysis.assessment}</p>\` : ''}
                                    </div>
                                    \` : ''}
                                </div>
                            </div>
                            
                            <!-- 内在价值分析 -->
                            \${intrinsicVal.dcfEstimate || intrinsicVal.assessment ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-green-400 mb-2 flex items-center">
                                    <i class="fas fa-gem mr-2"></i>内在价值评估
                                </h5>
                                \${intrinsicVal.fairValueRange ? \`<p class="text-gray-300 text-sm mb-2"><span class="text-gray-500">合理价值区间:</span> \${intrinsicVal.fairValueRange}</p>\` : ''}
                                \${intrinsicVal.marginOfSafety ? \`<p class="text-gray-300 text-sm mb-2"><span class="text-gray-500">安全边际:</span> \${intrinsicVal.marginOfSafety}</p>\` : ''}
                                \${intrinsicVal.dcfEstimate ? \`<p class="text-gray-400 text-sm mb-2"><span class="text-gray-500">DCF估值:</span> \${intrinsicVal.dcfEstimate}</p>\` : ''}
                                \${intrinsicVal.assessment ? \`<p class="text-gray-400 text-sm">\${intrinsicVal.assessment}</p>\` : ''}
                            </div>
                            \` : ''}
                            
                            <!-- 市场情绪分析 -->
                            \${marketSentiment.sentiment || marketSentiment.analysis ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-yellow-400 mb-2 flex items-center">
                                    <i class="fas fa-heartbeat mr-2"></i>市场情绪
                                </h5>
                                <div class="grid md:grid-cols-3 gap-3 mb-2">
                                    <div class="text-center">
                                        <div class="text-xs text-gray-500">换手率</div>
                                        <div class="text-sm text-yellow-400">\${marketSentiment.turnoverRate || '--'}%</div>
                                    </div>
                                    <div class="text-center">
                                        <div class="text-xs text-gray-500">量比</div>
                                        <div class="text-sm text-yellow-400">\${marketSentiment.volumeRatio || '--'}</div>
                                    </div>
                                    <div class="text-center">
                                        <div class="text-xs text-gray-500">情绪判断</div>
                                        <div class="text-sm \${marketSentiment.sentiment === '乐观' ? 'text-green-400' : marketSentiment.sentiment === '悲观' ? 'text-red-400' : 'text-gray-400'}">\${marketSentiment.sentiment || '--'}</div>
                                    </div>
                                </div>
                                \${marketSentiment.analysis ? \`<p class="text-gray-400 text-sm">\${marketSentiment.analysis}</p>\` : ''}
                            </div>
                            \` : ''}
                            
                            <!-- 买入建议 -->
                            \${investImpl.entryPointAssessment ? \`
                            <div class="bg-purple-900/20 p-4 rounded-lg border border-purple-800/30">
                                <h5 class="font-semibold text-purple-400 mb-2 flex items-center">
                                    <i class="fas fa-bullseye mr-2"></i>买入时机评估
                                </h5>
                                <p class="text-gray-300 text-sm">\${investImpl.entryPointAssessment}</p>
                                \${investImpl.priceTarget ? \`<p class="text-gray-400 text-sm mt-2"><span class="text-gray-500">目标价:</span> \${investImpl.priceTarget}</p>\` : ''}
                            </div>
                            \` : ''}
                            
                            <!-- 估值催化剂与风险 -->
                            <div class="grid md:grid-cols-2 gap-4">
                                \${valuation.catalysts && valuation.catalysts.length > 0 ? \`
                                <div class="bg-green-900/20 p-4 rounded-lg border border-green-800/30">
                                    <h5 class="font-semibold text-green-400 mb-2 flex items-center">
                                        <i class="fas fa-rocket mr-2"></i>估值修复催化剂
                                    </h5>
                                    <ul class="space-y-1">
                                        \${valuation.catalysts.map(c => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-check text-green-500 mr-2 mt-1"></i>\${c}</li>\`).join('')}
                                    </ul>
                                </div>
                                \` : ''}
                                \${valuation.risks && valuation.risks.length > 0 ? \`
                                <div class="bg-red-900/20 p-4 rounded-lg border border-red-800/30">
                                    <h5 class="font-semibold text-red-400 mb-2 flex items-center">
                                        <i class="fas fa-exclamation-triangle mr-2"></i>估值风险
                                    </h5>
                                    <ul class="space-y-1">
                                        \${valuation.risks.map(r => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-circle text-red-500 mr-2 mt-1.5 text-xs"></i>\${r}</li>\`).join('')}
                                    </ul>
                                </div>
                                \` : ''}
                            </div>
                        </div>
                    </details>
                \`;
            } else {
                valuationHtml = \`
                    <div class="grid md:grid-cols-4 gap-3">
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">PE:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">PB:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">PS:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">市值:</span> <span class="text-gray-400">--</span></div>
                    </div>
                    <p class="text-gray-500 text-sm mt-4">估值数据加载中...</p>
                \`;
            }
            
            if (valuationContent) {
                valuationContent.innerHTML = valuationHtml;
            }
        }
        
        // ========== 业务洞察显示函数 ==========
        function displayBusinessInsight(report) {
            const insight = report.businessInsightResult || {};
            
            // 调试日志 - 检查数据是否正确传入
            console.log('[BusinessInsight] Raw data:', JSON.stringify(insight).substring(0, 500));
            console.log('[BusinessInsight] Has data:', Object.keys(insight).length > 0);
            console.log('[BusinessInsight] Keys:', Object.keys(insight));
            
            // 适配新旧数据结构
            const channelAnalysis = insight.channelAnalysis || {};
            const productStructure = insight.productStructure || {};
            const industryPosition = insight.industryPosition || {};
            const keyFindings = insight.keyFindings || {};
            
            // 兼容旧结构
            const summary = insight.summary || {};
            const structure = insight.businessStructureAnalysis || {};
            let revenueBreakdown = structure.revenueBreakdown || {};
            
            // 安全地将对象转换为可显示的字符串
            const toDisplayString = (val) => {
                if (val === null || val === undefined) return null;
                if (typeof val === 'string') return val;
                if (typeof val === 'number') return String(val);
                if (typeof val === 'object') {
                    // 如果是对象，尝试提取有意义的内容
                    if (val.summary) return val.summary;
                    if (val.description) return val.description;
                    if (val.name) return val.name;
                    if (val.level) return val.level;
                    if (val.type) return val.type;
                    if (val.value) return val.value;
                    // 如果有文本属性
                    const textKeys = ['text', 'content', 'title', 'label'];
                    for (const key of textKeys) {
                        if (val[key] && typeof val[key] === 'string') return val[key];
                    }
                    // 对于数组，提取第一个元素或连接
                    if (Array.isArray(val)) {
                        if (val.length === 0) return null;
                        return val.map(item => typeof item === 'string' ? item : (item?.name || item?.title || JSON.stringify(item))).join('、');
                    }
                    // 尝试找到第一个字符串值
                    const values = Object.values(val);
                    for (const v of values) {
                        if (typeof v === 'string' && v.length > 5 && v.length < 200) return v;
                    }
                    // 最后尝试返回第一个有意义的内容
                    const firstKey = Object.keys(val)[0];
                    if (firstKey && typeof val[firstKey] === 'string') return val[firstKey];
                    return null;
                }
                return null;
            };
            
            // 使用新结构数据填充 parsedData - 所有值都用 toDisplayString 处理
            let parsedData = {
                industryPosition: toDisplayString(industryPosition.position) || toDisplayString(industryPosition.summary) || toDisplayString(summary.industryPosition),
                competitiveAdvantage: toDisplayString(keyFindings.competitiveAdvantage) || toDisplayString(keyFindings.coreBusiness) || toDisplayString(summary.competitiveAdvantage),
                growthDriver: toDisplayString(keyFindings.structureEvolution) || toDisplayString(keyFindings.potentialDirection) || toDisplayString(summary.growthDriver),
                coreBusinessContribution: toDisplayString(keyFindings.coreBusiness) || toDisplayString(keyFindings.profitability) || toDisplayString(summary.coreBusinessContribution),
                businessTrend: toDisplayString(keyFindings.businessDiversification) || toDisplayString(summary.businessTrend),
                oneSentence: toDisplayString(industryPosition.summary) || toDisplayString(keyFindings.coreBusiness) || toDisplayString(summary.oneSentence),
            };
            let parsedStructure = structure;
            
            // 尝试解析 rawResult（如果summary为空或不完整）
            if ((!parsedData.oneSentence || !parsedData.coreBusinessContribution) && insight.rawResult) {
                try {
                    let raw = insight.rawResult;
                    // 处理 markdown 代码块格式
                    raw = raw.replace(/^\`\`\`json\s*/i, '').replace(/^\`\`\`\s*/i, '');
                    raw = raw.replace(/\`\`\`\s*$/i, '');
                    raw = raw.trim();
                    
                    // 尝试完整解析
                    try {
                        const parsed = JSON.parse(raw);
                        parsedData = parsed.summary || parsed;
                        parsedStructure = parsed.businessStructureAnalysis || parsedStructure;
                        revenueBreakdown = parsedStructure.revenueBreakdown || revenueBreakdown;
                    } catch (parseErr) {
                        // JSON被截断，尝试提取可用数据
                        console.log('JSON truncated, extracting available data...');
                        
                        // 使用RegExp构造函数避免模板字符串转义问题
                        const extractField = (fieldName) => {
                            // 在模板字符串中需要4个反斜杠来得到1个
                            const regex = new RegExp('"' + fieldName + '"' + String.fromCharCode(92) + 's*:' + String.fromCharCode(92) + 's*"([^"]+)"');
                            const match = raw.match(regex);
                            return match ? match[1] : null;
                        };
                        
                        // 直接逐个字段提取
                        const businessTrend = extractField('businessTrend');
                        const industryPosition = extractField('industryPosition');
                        const competitiveAdvantage = extractField('competitiveAdvantage');
                        const growthDriver = extractField('growthDriver');
                        const oneSentence = extractField('oneSentence');
                        const coreBusinessContribution = extractField('coreBusinessContribution');
                        
                        if (businessTrend) parsedData.businessTrend = businessTrend;
                        if (industryPosition) parsedData.industryPosition = industryPosition;
                        if (competitiveAdvantage) parsedData.competitiveAdvantage = competitiveAdvantage;
                        if (growthDriver) parsedData.growthDriver = growthDriver;
                        if (oneSentence) parsedData.oneSentence = oneSentence;
                        if (coreBusinessContribution) parsedData.coreBusinessContribution = coreBusinessContribution;
                        
                        console.log('Extracted parsedData:', parsedData);
                        
                        // 提取 byProduct 部分
                        const byProduct = extractField('byProduct');
                        if (byProduct) {
                            revenueBreakdown.byProduct = byProduct;
                        }
                        
                        // 提取 byChannel 部分（可能被截断）
                        const byChannelRegex = new RegExp('"byChannel"' + String.fromCharCode(92) + 's*:' + String.fromCharCode(92) + 's*"([^"]*)');
                        const byChannelMatch = raw.match(byChannelRegex);
                        if (byChannelMatch && byChannelMatch[1].length > 50) {
                            revenueBreakdown.byChannel = byChannelMatch[1] + '...';
                        }
                    }
                } catch (e) {
                    console.log('Parse businessInsight rawResult failed:', e);
                }
            }
            
            // 业务趋势颜色
            const getTrendColor = (trend) => {
                if (!trend) return 'bg-gray-600';
                if (trend.includes('增长') && !trend.includes('放缓')) return 'bg-green-600';
                if (trend.includes('放缓') || trend.includes('下降')) return 'bg-yellow-500';
                if (trend.includes('领先') || trend.includes('强')) return 'bg-blue-600';
                return 'bg-cyan-600';
            };
            
            // 业务趋势徽章 - 检查是否有有效数据
            const hasValidInsight = parsedData.businessTrend || parsedData.industryPosition || parsedData.oneSentence || parsedData.coreBusinessContribution;
            const businessTrend = hasValidInsight ? (parsedData.businessTrend || parsedData.industryPosition || '分析完成') : '点击重新分析';
            const trendBadge = document.getElementById('businessTrendBadge');
            if (trendBadge) {
                if (hasValidInsight) {
                    trendBadge.className = \`px-4 py-1 rounded-full text-sm font-semibold \${getTrendColor(businessTrend)} text-white\`;
                    trendBadge.innerHTML = \`<i class="fas fa-chart-bar mr-1"></i>\${businessTrend}\`;
                } else {
                    trendBadge.className = 'px-4 py-1 rounded-full text-sm font-semibold bg-orange-600/50 text-orange-300 cursor-pointer';
                    trendBadge.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>点击重新分析';
                }
            }
            
            const insightContent = document.getElementById('businessInsightContent');
            let insightHtml = '';
            
            if (parsedData.oneSentence || parsedData.coreBusinessContribution || parsedData.growthDriver) {
                insightHtml = \`
                    <!-- 核心业务指标 -->
                    <div class="grid md:grid-cols-4 gap-3 mb-4">
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">行业地位</div>
                            <div class="text-lg font-semibold text-cyan-400">\${parsedData.industryPosition || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">竞争优势</div>
                            <div class="text-lg font-semibold text-green-400">\${parsedData.competitiveAdvantage || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">增长驱动</div>
                            <div class="text-sm font-semibold text-yellow-400">\${parsedData.growthDriver || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">核心业务贡献</div>
                            <div class="text-sm font-semibold text-purple-400">\${parsedData.coreBusinessContribution || '--'}</div>
                        </div>
                    </div>
                    
                    <!-- 核心洞察 -->
                    \${parsedData.oneSentence ? \`
                    <div class="p-3 bg-gray-800/30 rounded-lg border-l-2 border-cyan-500 mb-4">
                        <p class="text-gray-300">\${parsedData.oneSentence}</p>
                    </div>
                    \` : ''}
                    
                    <!-- 业务结构详情展开 -->
                    <details class="group mt-4">
                        <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-cyan-500/10 border border-cyan-600/50 rounded-lg hover:from-cyan-600/30 hover:to-cyan-500/20 transition-all flex items-center justify-between">
                            <span class="flex items-center text-cyan-400 font-semibold">
                                <i class="fas fa-sitemap mr-2"></i>
                                查看业务结构详情
                            </span>
                            <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-cyan-500"></i>
                        </summary>
                        <div class="mt-4 space-y-4 border-t border-gray-700 pt-4">
                            \${revenueBreakdown.byProduct ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-cyan-400 mb-2 flex items-center">
                                    <i class="fas fa-boxes mr-2"></i>产品结构
                                </h5>
                                <p class="text-gray-300 text-sm">\${revenueBreakdown.byProduct}</p>
                            </div>
                            \` : ''}
                            \${revenueBreakdown.byChannel ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-blue-400 mb-2 flex items-center">
                                    <i class="fas fa-store mr-2"></i>渠道结构
                                </h5>
                                <p class="text-gray-300 text-sm">\${revenueBreakdown.byChannel}</p>
                            </div>
                            \` : ''}
                            \${revenueBreakdown.byRegion ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-green-400 mb-2 flex items-center">
                                    <i class="fas fa-globe mr-2"></i>地区分布
                                </h5>
                                <p class="text-gray-300 text-sm">\${revenueBreakdown.byRegion}</p>
                            </div>
                            \` : ''}
                            \${insight.keyFindings && insight.keyFindings.length > 0 ? \`
                            <div class="bg-cyan-900/20 p-4 rounded-lg border border-cyan-800/30">
                                <h5 class="font-semibold text-cyan-400 mb-2 flex items-center">
                                    <i class="fas fa-lightbulb mr-2"></i>关键发现
                                </h5>
                                <ul class="space-y-2">
                                    \${insight.keyFindings.map(f => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-check text-cyan-500 mr-2 mt-1"></i>\${f}</li>\`).join('')}
                                </ul>
                            </div>
                            \` : ''}
                        </div>
                    </details>
                \`;
            } else {
                insightHtml = \`
                    <div class="grid md:grid-cols-3 gap-3">
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">行业地位:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">竞争优势:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">增长驱动:</span> <span class="text-gray-400">--</span></div>
                    </div>
                    <p class="text-gray-500 text-sm mt-4">业务洞察数据加载中...</p>
                \`;
            }
            
            if (insightContent) {
                insightContent.innerHTML = insightHtml;
            }
        }
        
        // ========== 业绩预测显示函数 ==========
        function displayForecast(report) {
            const forecast = report.forecastResult || {};
            const summary = forecast.summary || {};
            const guidance = forecast.managementGuidance || {};
            const detailed = forecast.detailedForecast || {};
            const shortTerm = detailed.shortTerm || {};
            const scenario = detailed.scenarioAnalysis || {};
            const catalysts = forecast.catalysts || {};
            
            // 置信度颜色
            const getConfidenceColor = (confidence) => {
                if (!confidence) return 'bg-gray-600';
                if (confidence === '高' || confidence.includes('高')) return 'bg-green-600';
                if (confidence === '中' || confidence.includes('中')) return 'bg-yellow-500';
                return 'bg-red-500';
            };
            
            // 预测置信度徽章
            const confidence = summary.confidence || forecast.confidence || '数据加载中';
            const confidenceBadge = document.getElementById('forecastConfidenceBadge');
            if (confidenceBadge) {
                confidenceBadge.className = \`px-4 py-1 rounded-full text-sm font-semibold \${getConfidenceColor(confidence)} text-white\`;
                confidenceBadge.innerHTML = \`<i class="fas fa-bullseye mr-1"></i>置信度: \${confidence}\`;
            }
            
            const forecastContent = document.getElementById('forecastContent');
            let forecastHtml = '';
            
            if (summary.oneSentence || summary.revenueOutlook || summary.growthRate) {
                forecastHtml = \`
                    <!-- 预测核心指标 -->
                    <div class="grid md:grid-cols-4 gap-3 mb-4">
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">营收展望</div>
                            <div class="text-lg font-semibold text-emerald-400">\${summary.revenueOutlook || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">利润展望</div>
                            <div class="text-lg font-semibold text-green-400">\${summary.profitOutlook || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">预期增速</div>
                            <div class="text-lg font-semibold text-yellow-400">\${summary.growthRate || '--'}</div>
                        </div>
                        <div class="bg-gray-800/40 p-3 rounded-lg border border-gray-700">
                            <div class="text-xs text-gray-500 mb-1">预测基础</div>
                            <div class="text-xs font-semibold text-blue-400">\${summary.forecastBasis || '--'}</div>
                        </div>
                    </div>
                    
                    <!-- 核心预测结论 -->
                    \${summary.oneSentence ? \`
                    <div class="p-3 bg-gray-800/30 rounded-lg border-l-2 border-emerald-500 mb-4">
                        <p class="text-gray-300">\${summary.oneSentence}</p>
                    </div>
                    \` : ''}
                    
                    <!-- 管理层指引 -->
                    \${guidance.hasGuidance ? \`
                    <div class="grid md:grid-cols-3 gap-3 mb-4">
                        <div class="bg-emerald-900/20 p-3 rounded-lg border border-emerald-700/30">
                            <div class="text-xs text-gray-500 mb-1">业绩预告类型</div>
                            <div class="text-lg font-semibold text-emerald-400">\${guidance.guidanceType || '--'}</div>
                        </div>
                        <div class="bg-green-900/20 p-3 rounded-lg border border-green-700/30">
                            <div class="text-xs text-gray-500 mb-1">预期变动</div>
                            <div class="text-lg font-semibold text-green-400">\${guidance.expectedChange || '--'}</div>
                        </div>
                        <div class="bg-blue-900/20 p-3 rounded-lg border border-blue-700/30">
                            <div class="text-xs text-gray-500 mb-1">可靠性</div>
                            <div class="text-lg font-semibold text-blue-400">\${guidance.guidanceReliability || '--'}</div>
                        </div>
                    </div>
                    \` : ''}
                    
                    <!-- 情景分析摘要 -->
                    \${scenario.bullCase || scenario.baseCase || scenario.bearCase ? \`
                    <div class="grid md:grid-cols-3 gap-3 mb-4">
                        \${scenario.bullCase ? \`
                        <div class="bg-green-900/20 p-3 rounded-lg border border-green-700/30">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-green-400 font-semibold text-sm"><i class="fas fa-arrow-up mr-1"></i>乐观情景</span>
                                <span class="text-xs text-gray-500">\${scenario.bullCase.probability || ''}</span>
                            </div>
                            <div class="text-lg font-bold text-green-300">\${scenario.bullCase.growth || '--'}</div>
                        </div>
                        \` : ''}
                        \${scenario.baseCase ? \`
                        <div class="bg-yellow-900/20 p-3 rounded-lg border border-yellow-700/30">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-yellow-400 font-semibold text-sm"><i class="fas fa-minus mr-1"></i>基准情景</span>
                                <span class="text-xs text-gray-500">\${scenario.baseCase.probability || ''}</span>
                            </div>
                            <div class="text-lg font-bold text-yellow-300">\${scenario.baseCase.growth || '--'}</div>
                        </div>
                        \` : ''}
                        \${scenario.bearCase ? \`
                        <div class="bg-red-900/20 p-3 rounded-lg border border-red-700/30">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-red-400 font-semibold text-sm"><i class="fas fa-arrow-down mr-1"></i>悲观情景</span>
                                <span class="text-xs text-gray-500">\${scenario.bearCase.probability || ''}</span>
                            </div>
                            <div class="text-lg font-bold text-red-300">\${scenario.bearCase.growth || '--'}</div>
                        </div>
                        \` : ''}
                    </div>
                    \` : ''}
                    
                    <!-- 详细预测展开 -->
                    <details class="group mt-4">
                        <summary class="cursor-pointer px-4 py-2 bg-gradient-to-r from-emerald-600/20 to-emerald-500/10 border border-emerald-600/50 rounded-lg hover:from-emerald-600/30 hover:to-emerald-500/20 transition-all flex items-center justify-between">
                            <span class="flex items-center text-emerald-400 font-semibold">
                                <i class="fas fa-chart-line mr-2"></i>
                                查看详细预测分析
                            </span>
                            <i class="fas fa-chevron-down group-open:rotate-180 transition-transform text-emerald-500"></i>
                        </summary>
                        <div class="mt-4 space-y-4 border-t border-gray-700 pt-4">
                            <!-- 短期预测 -->
                            \${shortTerm.revenueGrowth || shortTerm.profitGrowth ? \`
                            <div class="bg-gray-800/30 p-4 rounded-lg">
                                <h5 class="font-semibold text-emerald-400 mb-2 flex items-center">
                                    <i class="fas fa-calendar-alt mr-2"></i>短期预测 (\${shortTerm.period || '未来1年'})
                                </h5>
                                \${shortTerm.revenueGrowth ? \`<p class="text-gray-300 text-sm mb-2"><strong>营收增长:</strong> \${shortTerm.revenueGrowth}</p>\` : ''}
                                \${shortTerm.profitGrowth ? \`<p class="text-gray-300 text-sm mb-2"><strong>利润增长:</strong> \${shortTerm.profitGrowth}</p>\` : ''}
                                \${shortTerm.keyAssumptions && shortTerm.keyAssumptions.length > 0 ? \`
                                <div class="mt-3">
                                    <p class="text-xs text-gray-500 mb-1">关键假设:</p>
                                    <ul class="text-xs text-gray-400 space-y-1">
                                        \${shortTerm.keyAssumptions.map(a => \`<li>• \${a}</li>\`).join('')}
                                    </ul>
                                </div>
                                \` : ''}
                            </div>
                            \` : ''}
                            
                            <!-- 催化剂 -->
                            \${(catalysts.positive && catalysts.positive.length > 0) || (catalysts.negative && catalysts.negative.length > 0) ? \`
                            <div class="grid md:grid-cols-2 gap-4">
                                \${catalysts.positive && catalysts.positive.length > 0 ? \`
                                <div class="bg-green-900/20 p-4 rounded-lg border border-green-800/30">
                                    <h5 class="font-semibold text-green-400 mb-2 flex items-center">
                                        <i class="fas fa-arrow-up mr-2"></i>正向催化剂
                                    </h5>
                                    <ul class="space-y-2">
                                        \${catalysts.positive.map(c => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-plus text-green-500 mr-2 mt-1"></i>\${c}</li>\`).join('')}
                                    </ul>
                                </div>
                                \` : ''}
                                \${catalysts.negative && catalysts.negative.length > 0 ? \`
                                <div class="bg-red-900/20 p-4 rounded-lg border border-red-800/30">
                                    <h5 class="font-semibold text-red-400 mb-2 flex items-center">
                                        <i class="fas fa-arrow-down mr-2"></i>负向催化剂
                                    </h5>
                                    <ul class="space-y-2">
                                        \${catalysts.negative.map(c => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-minus text-red-500 mr-2 mt-1"></i>\${c}</li>\`).join('')}
                                    </ul>
                                </div>
                                \` : ''}
                            </div>
                            \` : ''}
                            
                            <!-- 预测风险 -->
                            \${forecast.forecastRisks && forecast.forecastRisks.length > 0 ? \`
                            <div class="bg-yellow-900/20 p-4 rounded-lg border border-yellow-800/30">
                                <h5 class="font-semibold text-yellow-400 mb-2 flex items-center">
                                    <i class="fas fa-exclamation-triangle mr-2"></i>预测风险
                                </h5>
                                <ul class="space-y-2">
                                    \${forecast.forecastRisks.map(r => \`<li class="text-gray-300 text-sm flex items-start"><i class="fas fa-circle text-yellow-500 mr-2 mt-1.5 text-xs"></i>\${r}</li>\`).join('')}
                                </ul>
                            </div>
                            \` : ''}
                        </div>
                    </details>
                \`;
            } else {
                forecastHtml = \`
                    <div class="grid md:grid-cols-3 gap-3">
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">营收展望:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">利润展望:</span> <span class="text-gray-400">--</span></div>
                        <div class="bg-gray-800/30 p-3 rounded-lg"><span class="text-gray-500">预期增速:</span> <span class="text-gray-400">--</span></div>
                    </div>
                    <p class="text-gray-500 text-sm mt-4">业绩预测数据加载中...</p>
                \`;
            }
            
            if (forecastContent) {
                forecastContent.innerHTML = forecastHtml;
            }
        }
        
        // 导出 PDF
        async function exportPDF(includeComic = false) {
            if (!currentReportId) {
                alert('请等待分析完成');
                return;
            }
            
            // 获取当前权限
            const perms = getPermissions();
            const tier = perms?.tier || 'guest';
            
            // 访客不能导出
            if (tier === 'guest') {
                showUpgradePrompt('pdf_export', '注册登录后即可导出PDF报告');
                return;
            }
            
            // 免费用户提示有水印
            if (tier === 'free') {
                const proceed = confirm('免费版导出的PDF将包含水印，升级Pro会员可去除水印。\\n\\n是否继续导出？');
                if (!proceed) {
                    showUpgradePrompt('pdf_no_watermark', '升级Pro会员，导出无水印PDF');
                    return;
                }
            }
            
            // 构建URL参数，传递用户等级用于水印判断
            const token = localStorage.getItem('accessToken');
            let url = includeComic 
                ? \`/api/reports/\${currentReportId}/pdf?comic=true\`
                : \`/api/reports/\${currentReportId}/pdf\`;
            
            // 如果有token，添加到URL以便后端识别用户等级
            if (token) {
                url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
            }
            
            // 打开新窗口显示 PDF 报告
            window.open(url, '_blank');
        }
        
        // PDF下拉菜单切换
        function togglePdfDropdown() {
            const menu = document.getElementById('pdfDropdownMenu');
            menu.classList.toggle('hidden');
        }
        
        // 点击外部关闭下拉菜单
        document.addEventListener('click', function(event) {
            const dropdown = document.getElementById('pdfDropdown');
            const menu = document.getElementById('pdfDropdownMenu');
            if (dropdown && menu && !dropdown.contains(event.target)) {
                menu.classList.add('hidden');
            }
        });
        
        // 显示漫画角色变更确认弹窗（返回 Promise）
        function showComicConfirmDialog(currentChar, requestedChar, changeInfo) {
            return new Promise((resolve) => {
                const modal = document.getElementById('comicConfirmModal');
                const message = document.getElementById('comicConfirmMessage');
                const viewBtn = document.getElementById('comicConfirmView');
                const regenBtn = document.getElementById('comicConfirmRegenerate');
                
                // 设置提示信息（支持自定义变更信息）
                let messageHtml;
                if (changeInfo) {
                    messageHtml = '检测到配置变更：<span class="text-purple-400 font-medium">' + changeInfo + '</span><br><br>已有 <span class="text-yellow-400 font-medium">"' + currentChar + '"</span> 版本的漫画，请选择：';
                } else {
                    messageHtml = '已为您生成过 <span class="text-yellow-400 font-medium">"' + currentChar + '"</span> 版本的漫画。<br><br>您当前选择的是 <span class="text-purple-400 font-medium">"' + requestedChar + '"</span>，请选择：';
                }
                message.innerHTML = messageHtml;
                
                // 显示弹窗
                modal.classList.add('active');
                
                // 清除旧的事件监听器
                const newViewBtn = viewBtn.cloneNode(true);
                const newRegenBtn = regenBtn.cloneNode(true);
                viewBtn.parentNode.replaceChild(newViewBtn, viewBtn);
                regenBtn.parentNode.replaceChild(newRegenBtn, regenBtn);
                
                // 绑定按钮事件
                newViewBtn.addEventListener('click', () => {
                    modal.classList.remove('active');
                    resolve('view');
                });
                
                newRegenBtn.addEventListener('click', () => {
                    modal.classList.remove('active');
                    resolve('regenerate');
                });
            });
        }
        
        // 显示漫画配置弹窗
        function showComicConfigModal() {
            if (!currentReportId) {
                alert('请等待分析完成');
                return;
            }
            
            // 检查AI漫画权限
            const perms = getPermissions();
            if (!perms?.canViewAiComic) {
                const needLogin = perms?.tier === 'guest';
                showUpgradePrompt(
                    needLogin ? '登录后升级Pro会员即可体验AI漫画解读功能' : '升级Pro会员，解锁AI漫画解读功能',
                    needLogin
                );
                return;
            }
            
            document.getElementById('comicConfigModal').classList.add('active');
            
            // 绑定角色模式切换事件
            document.querySelectorAll('.character-mode-option').forEach(option => {
                option.addEventListener('click', () => {
                    // 移除其他选中状态
                    document.querySelectorAll('.character-mode-option').forEach(opt => {
                        opt.classList.remove('border-2', 'border-yellow-500', 'border-purple-500', 'bg-yellow-900/20', 'bg-purple-900/20');
                        opt.classList.add('border', 'border-gray-600');
                    });
                    
                    const mode = option.dataset.mode;
                    if (mode === 'single') {
                        option.classList.add('border-2', 'border-yellow-500', 'bg-yellow-900/20');
                        option.classList.remove('border', 'border-gray-600');
                        useMultiCharacterMode = false;
                        document.getElementById('singleCharacterSection').classList.remove('hidden');
                        document.getElementById('multiCharacterSection').classList.add('hidden');
                        document.getElementById('characterModeDesc').innerHTML = '<span class="text-yellow-400">👤 单角色模式</span>：选择一个IP角色统一演绎整个8格漫画';
                    } else {
                        option.classList.add('border-2', 'border-purple-500', 'bg-purple-900/20');
                        option.classList.remove('border', 'border-gray-600');
                        useMultiCharacterMode = true;
                        document.getElementById('singleCharacterSection').classList.add('hidden');
                        document.getElementById('multiCharacterSection').classList.remove('hidden');
                        document.getElementById('characterModeDesc').innerHTML = '<span class="text-purple-400">👥 多角色主题模式</span>：AI根据每格内容从主题系列中智能选择最合适的角色';
                    }
                    option.querySelector('input').checked = true;
                    console.log('[Comic Config] Character mode:', mode, 'useMultiCharacter:', useMultiCharacterMode);
                });
            });
            
            // 绑定主题选择事件（多角色模式）
            document.querySelectorAll('.theme-option').forEach(option => {
                option.addEventListener('click', () => {
                    // 移除其他选中状态
                    document.querySelectorAll('.theme-option').forEach(opt => {
                        opt.classList.remove('selected', 'border-2', 'border-yellow-500', 'border-orange-500', 'border-amber-500', 'border-pink-500', 'border-red-500', 'border-blue-500', 'border-purple-500', 'border-cyan-500', 'bg-yellow-900/20', 'bg-orange-900/20', 'bg-amber-900/20', 'bg-pink-900/20', 'bg-red-900/20', 'bg-blue-900/20', 'bg-purple-900/20', 'bg-cyan-900/20');
                        opt.classList.add('border', 'border-gray-600');
                    });
                    
                    // 添加选中状态
                    const themeId = option.dataset.theme;
                    const colorMap = {
                        'nezha-universe': { border: 'border-yellow-500', bg: 'bg-yellow-900/20' },
                        'zootopia': { border: 'border-orange-500', bg: 'bg-orange-900/20' },
                        'the-croods': { border: 'border-amber-500', bg: 'bg-amber-900/20' },
                        'disney-princess': { border: 'border-pink-500', bg: 'bg-pink-900/20' },
                        'mickey-clubhouse': { border: 'border-red-500', bg: 'bg-red-900/20' },
                        'league-of-legends': { border: 'border-purple-500', bg: 'bg-purple-900/20' },
                        'business-original': { border: 'border-cyan-500', bg: 'bg-cyan-900/20' }
                    };
                    const colors = colorMap[themeId] || colorMap['nezha-universe'];
                    option.classList.add('selected', 'border-2', colors.border, colors.bg);
                    option.classList.remove('border', 'border-gray-600');
                    
                    selectedThemeId = themeId;
                    // 更新描述
                    const themeDesc = themeDescriptions[themeId] || '';
                    const themeName = themeNames[themeId] || themeId;
                    document.getElementById('themeDesc').innerHTML = \`<span class="text-yellow-400">\${option.querySelector('.text-2xl').textContent} \${themeName}</span>：\${themeDesc}，AI将根据每格内容自动分配最合适的角色\`;
                    
                    console.log('[Comic Config] Theme selected:', selectedThemeId);
                });
            });
            
            // 绑定AI角色选择复选框
            const letAIChooseCheckbox = document.getElementById('letAIChoose');
            if (letAIChooseCheckbox) {
                letAIChooseCheckbox.addEventListener('change', () => {
                    letAIChooseCharacters = letAIChooseCheckbox.checked;
                    console.log('[Comic Config] Let AI choose:', letAIChooseCharacters);
                });
            }
            
            // 绑定角色选择事件（单角色模式）
            document.querySelectorAll('.character-option').forEach(option => {
                option.addEventListener('click', () => {
                    // 移除其他选中状态
                    document.querySelectorAll('.character-option').forEach(opt => {
                        opt.classList.remove('selected', 'border-red-500', 'border-blue-500', 'border-yellow-500');
                        opt.classList.add('border-gray-600');
                    });
                    // 添加选中状态
                    option.classList.add('selected', 'border-red-500');
                    option.classList.remove('border-gray-600');
                    
                    selectedCharacterSet = option.dataset.set;
                    selectedCharacterId = option.dataset.char;
                    console.log('[Comic Config] Selected:', selectedCharacterSet, selectedCharacterId);
                });
            });
            
            // 绑定布局选择事件
            document.querySelectorAll('.layout-option').forEach(option => {
                option.addEventListener('click', () => {
                    // 移除其他选中状态
                    document.querySelectorAll('.layout-option').forEach(opt => {
                        opt.classList.remove('border-yellow-500', 'border-blue-500', 'bg-yellow-900/20', 'bg-blue-900/20');
                        opt.classList.add('border-gray-600');
                    });
                    // 添加选中状态
                    const layout = option.dataset.layout;
                    if (layout === 'single-column') {
                        option.classList.add('border-yellow-500', 'bg-yellow-900/20');
                    } else {
                        option.classList.add('border-blue-500', 'bg-blue-900/20');
                    }
                    option.classList.remove('border-gray-600');
                    option.querySelector('input').checked = true;
                    
                    selectedDisplayLayout = layout;
                    console.log('[Comic Config] Layout:', selectedDisplayLayout);
                });
            });
            
            // 绑定内容风格选择事件
            document.querySelectorAll('.content-style-option').forEach(option => {
                option.addEventListener('click', () => {
                    // 移除其他选中状态
                    document.querySelectorAll('.content-style-option').forEach(opt => {
                        opt.classList.remove('selected', 'border-2', 'border-yellow-500', 'border-blue-500', 'border-purple-500', 'border-green-500', 'border-cyan-500', 'bg-yellow-900/20', 'bg-blue-900/20', 'bg-purple-900/20', 'bg-green-900/20', 'bg-cyan-900/20');
                        opt.classList.add('border', 'border-gray-600');
                    });
                    
                    // 根据风格添加对应颜色
                    const style = option.dataset.style;
                    const colorMap = {
                        'structured': { border: 'border-blue-500', bg: 'bg-blue-900/20' },
                        'creative': { border: 'border-yellow-500', bg: 'bg-yellow-900/20' },
                        'academic': { border: 'border-purple-500', bg: 'bg-purple-900/20' },
                        'story': { border: 'border-green-500', bg: 'bg-green-900/20' },
                        'dashboard': { border: 'border-cyan-500', bg: 'bg-cyan-900/20' }
                    };
                    const colors = colorMap[style] || colorMap['creative'];
                    
                    option.classList.add('selected', 'border-2', colors.border, colors.bg);
                    option.classList.remove('border', 'border-gray-600');
                    
                    selectedContentStyle = style;
                    
                    // 更新描述文本
                    const descEl = document.getElementById('contentStyleDesc');
                    if (descEl && contentStyleDescriptions[style]) {
                        descEl.innerHTML = contentStyleDescriptions[style];
                    }
                    
                    console.log('[Comic Config] Content Style:', selectedContentStyle);
                });
            });
        }
        
        function hideComicConfigModal() {
            document.getElementById('comicConfigModal').classList.remove('active');
        }
        
        // 是否强制重新生成的标志
        let forceRegenerateFlag = false;
        
        // 漫画生成的 AbortController（用于停止生成）
        let comicAbortController = null;
        
        // 停止漫画生成
        function stopComicGeneration() {
            if (comicAbortController) {
                comicAbortController.abort();
                comicAbortController = null;
                console.log('[Comic] Generation stopped by user');
            }
            document.getElementById('comicModal').classList.remove('active');
            alert('漫画生成已停止');
        }
        
        // 开始生成漫画（从配置弹窗触发）
        async function startGenerateComic() {
            // 获取输出格式
            const formatRadio = document.querySelector('input[name="outputFormat"]:checked');
            selectedOutputFormat = formatRadio ? formatRadio.value : 'grid';
            
            // 获取图片质量模式设置（单选按钮）
            const qualityModeRadio = document.querySelector('input[name="qualityMode"]:checked');
            const qualityMode = qualityModeRadio ? qualityModeRadio.value : 'standard';
            
            // 根据选择设置对应的模式标志
            window.useNanoBananaMode = (qualityMode === 'nanoBanana');
            window.usePromptBuilderMode = (qualityMode === 'promptBuilder');
            
            console.log('[Comic Config] Starting with:', { 
                format: selectedOutputFormat, 
                qualityMode: qualityMode,
                nanoBanana: window.useNanoBananaMode,
                promptBuilder: window.usePromptBuilderMode,
                character: selectedCharacterId,
                contentStyle: selectedContentStyle,
                forceRegenerate: forceRegenerateFlag,
                // 多角色主题参数
                useMultiCharacter: useMultiCharacterMode,
                themeId: selectedThemeId,
                letAIChoose: letAIChooseCharacters
            });
            
            hideComicConfigModal();
            
            // 如果是强制重新生成，直接执行生成（跳过缓存检查）
            if (forceRegenerateFlag) {
                forceRegenerateFlag = false; // 重置标志
                await executeForceRegenerate();
            } else {
                await generateComic();
            }
        }
        
        // 生成漫画 - 支持IP角色选择和长图文格式
        async function generateComic() {
            if (!currentReportId) {
                alert('请等待分析完成');
                return;
            }
            
            // 显示加载弹窗
            const modal = document.getElementById('comicModal');
            modal.classList.add('active');
            
            // 显示选中的角色/主题
            const characterNameEl = document.getElementById('comicModalCharacter');
            // 定义charName，用于后续进度显示
            let charName;
            if (useMultiCharacterMode) {
                const themeName = themeNames[selectedThemeId] || selectedThemeId;
                charName = themeName + '系列'; // 用于进度显示
                characterNameEl.textContent = \`主题: \${themeName}（多角色模式）\`;
            } else {
                charName = characterNames[selectedCharacterId] || selectedCharacterId;
                characterNameEl.textContent = \`角色: \${charName}\`;
            }
            
            const statusText = modal.querySelector('#comicModalStatus') || modal.querySelector('p:last-child');
            if (statusText) statusText.textContent = '正在检查漫画缓存...';
            
            try {
                // 1. 先检查是否已有预生成的漫画（带 IP 角色和内容风格参数检测）
                // 多角色模式使用 themeId 作为 characterSetId，mainCharacterId 为 'multi'
                const checkCharacterSetId = useMultiCharacterMode ? selectedThemeId : selectedCharacterSet;
                const checkMainCharacterId = useMultiCharacterMode ? 'multi' : selectedCharacterId;
                const checkContentStyle = selectedContentStyle || 'creative';
                const checkUrl = '/api/reports/' + currentReportId + '/comic?characterSetId=' + encodeURIComponent(checkCharacterSetId) + '&mainCharacterId=' + encodeURIComponent(checkMainCharacterId) + '&contentStyle=' + encodeURIComponent(checkContentStyle);
                const checkResponse = await fetch(checkUrl);
                const checkData = await checkResponse.json();
                
                // 检查是否需要重新生成（IP角色变化、内容风格变化或图片过期）
                if (checkData.needRegenerate && (checkData.reason === 'character_changed' || checkData.reason === 'style_changed')) {
                    // 配置变更时，给用户选择：查看已有漫画还是重新生成
                    const currentChar = characterNames[checkData.currentCharacter?.characterId] || themeNames[checkData.currentCharacter?.setId] || checkData.currentCharacter?.characterId || '未知';
                    const requestedChar = characterNames[checkData.requestedCharacter?.characterId] || themeNames[checkData.requestedCharacter?.setId] || checkData.requestedCharacter?.characterId || '未知';
                    
                    // 内容风格名称映射
                    const styleNames = {
                        'structured': '规范4步分析',
                        'creative': '自由创意',
                        'academic': '学术论文',
                        'story': '叙事故事',
                        'dashboard': '数据仪表盘'
                    };
                    const currentStyle = styleNames[checkData.currentStyle] || checkData.currentStyle || '未知';
                    const requestedStyle = styleNames[checkData.requestedStyle] || checkData.requestedStyle || '未知';
                    
                    // 根据变化类型生成提示信息
                    let changeInfo = '';
                    if (checkData.reason === 'style_changed') {
                        changeInfo = \`内容风格从"\${currentStyle}"变为"\${requestedStyle}"\`;
                        console.log(\`[Comic] Style changed: \${currentStyle} -> \${requestedStyle}\`);
                    } else {
                        changeInfo = \`角色从"\${currentChar}"变为"\${requestedChar}"\`;
                        console.log(\`[Comic] Character changed: \${currentChar} -> \${requestedChar}\`);
                    }
                    
                    document.getElementById('comicModal').classList.remove('active');
                    
                    // 使用自定义确认弹窗
                    const userChoice = await showComicConfirmDialog(currentChar, requestedChar, changeInfo);
                    
                    if (userChoice === 'view') {
                        // 用户选择查看已有漫画，用已有配置重新获取
                        const existingUrl = \`/api/reports/\${currentReportId}/comic?characterSetId=\${encodeURIComponent(checkData.currentCharacter?.setId || '')}&mainCharacterId=\${encodeURIComponent(checkData.currentCharacter?.characterId || '')}&contentStyle=\${encodeURIComponent(checkData.currentStyle || 'creative')}\`;
                        const existingResponse = await fetch(existingUrl);
                        const existingData = await existingResponse.json();
                        if (existingData.success && existingData.comic) {
                            currentComicData = existingData.comic;
                            displayComic(existingData.comic);
                            return;
                        }
                    }
                    // 用户选择重新生成，继续执行下面的生成逻辑
                    document.getElementById('comicModal').classList.add('active');
                    if (statusText) statusText.textContent = \`正在用新配置重新生成漫画，预计需要 2-3 分钟...\`;
                } else if (checkData.needRegenerate) {
                    // 图片过期，自动重新生成
                    console.log('[Comic] Images expired, regenerating...');
                    if (statusText) statusText.textContent = '图片已过期，正在重新生成漫画...';
                    // 继续执行下面的生成逻辑，设置强制重新生成
                } else if (checkData.success && checkData.comic && checkData.comic.panels?.length > 0) {
                    // 缓存命中且有效！秒级响应
                    console.log('[Comic] Cache hit! Pre-generated comic found with', checkData.comic.panels.length, 'panels');
                    document.getElementById('comicModal').classList.remove('active');
                    currentComicData = checkData.comic; // 缓存漫画数据用于布局切换
                    displayComic(checkData.comic);
                    return;
                }
                
                // 2. 需要实时生成（无缓存、IP变化、或图片过期）
                const needForceRegenerate = checkData.needRegenerate || false;
                console.log('[Comic] Generating...', { needForceRegenerate, characterSet: selectedCharacterSet, character: selectedCharacterId, contentStyle: selectedContentStyle, format: selectedOutputFormat });
                
                // 显示进度提示并启动真实进度轮询
                const progressText = modal.querySelector('#comicModalStatus') || modal.querySelector('p:last-child');
                if (progressText) progressText.textContent = charName + '正在为您绘制8页漫画解读版，预计需要1-2分钟...';
                
                // 更新进度条UI的函数
                // 缓存脚本信息以便后续显示
                let scriptInfo = null;
                
                function updateProgressUI(progress) {
                    if (!progressText) return;
                    
                    const percent = progress.percent || 0;
                    
                    // 如果收到脚本摘要，缓存它
                    if (progress.scriptSummary) {
                        scriptInfo = progress.scriptSummary;
                    }
                    
                    // 构建进度显示文本
                    let displayMessage = progress.message || '生成中...';
                    
                    // 添加角色信息（脚本完成后）
                    if (progress.stage === 'script_done' && scriptInfo && scriptInfo.charactersUsed) {
                        const charList = scriptInfo.charactersUsed.slice(0, 5).join('、');
                        const charExtra = scriptInfo.charactersUsed.length > 5 ? '等' : '';
                        displayMessage += '\\n📚 角色阵容：' + charList + charExtra;
                    }
                    
                    // 添加当前面板角色和标题（图片生成阶段）
                    if ((progress.stage === 'images_batch_1' || progress.stage === 'images_batch_2') && progress.characterName && progress.panelTitle) {
                        // 已经在 message 中了，不需要额外添加
                    }
                    
                    // 面板进度信息
                    const panelInfo = progress.currentPanel && progress.totalPanels 
                        ? ' (' + progress.currentPanel + '/' + progress.totalPanels + '页)' 
                        : '';
                    
                    // 更新进度条
                    const progressBar = modal.querySelector('#comicProgressBar');
                    if (progressBar) {
                        progressBar.style.width = percent + '%';
                        // 根据进度阶段设置颜色
                        if (percent < 20) {
                            progressBar.style.backgroundColor = '#3b82f6'; // blue - 初始化
                        } else if (percent < 55) {
                            progressBar.style.backgroundColor = '#8b5cf6'; // purple - 批次1
                        } else if (percent < 90) {
                            progressBar.style.backgroundColor = '#ec4899'; // pink - 批次2
                        } else {
                            progressBar.style.backgroundColor = '#22c55e'; // green - 完成
                        }
                    }
                    
                    // 更新文本
                    progressText.innerHTML = displayMessage + panelInfo + ' <span class="text-yellow-400">[' + percent + '%]</span>';
                }
                
                // 轮询进度API（每2秒）
                let progressPollingActive = true;
                const progressInterval = setInterval(async () => {
                    if (!progressPollingActive) return;
                    
                    try {
                        const progressResponse = await fetch('/api/reports/' + currentReportId + '/comic/progress');
                        const progressData = await progressResponse.json();
                        
                        if (progressData.success && progressData.progress) {
                            updateProgressUI(progressData.progress);
                            console.log('[Comic Progress]', progressData.progress);
                            
                            // 如果进度显示失败，停止轮询并显示错误
                            if (progressData.progress.stage === 'failed') {
                                progressPollingActive = false;
                                clearInterval(progressInterval);
                                document.getElementById('comicModal').classList.remove('active');
                                showComicError(progressData.progress.message || '漫画生成失败', true);
                            }
                        }
                    } catch (e) {
                        // 忽略轮询错误
                        console.log('[Comic Progress] Polling error:', e);
                    }
                }, 2000);
                
                const headers = {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                };
                
                // 创建 AbortController 用于停止生成（3分钟超时）
                comicAbortController = new AbortController();
                const timeoutId = setTimeout(() => {
                    clearInterval(progressInterval);
                    comicAbortController.abort();
                }, 180000);
                
                console.log('[Comic] Sending POST request to generate comic...');
                // 根据模式正确设置 characterSetId 和 mainCharacterId
                const postCharacterSetId = useMultiCharacterMode ? selectedThemeId : selectedCharacterSet;
                const postMainCharacterId = useMultiCharacterMode ? 'multi' : selectedCharacterId;
                console.log('[Comic] POST params:', { useMultiCharacterMode, postCharacterSetId, postMainCharacterId, selectedThemeId });
                
                const response = await fetch(\`/api/reports/\${currentReportId}/comic\`, {
                    method: 'POST',
                    headers,
                    signal: comicAbortController.signal,
                    body: JSON.stringify({
                        style: useMultiCharacterMode ? 'multi-character' : (selectedCharacterSet === 'nezha-movie' ? 'nezha' : 'business'),
                        characterSetId: postCharacterSetId,
                        mainCharacterId: postMainCharacterId,
                        contentStyle: selectedContentStyle, // 内容风格（structured/creative/academic/story/dashboard）
                        outputFormat: selectedOutputFormat,
                        forceRegenerate: needForceRegenerate, // IP变化或图片过期时强制重新生成
                        useNanoBanana: window.useNanoBananaMode || false, // 高质量Nano Banana模式
                        usePromptBuilder: window.usePromptBuilderMode || false, // Comic Prompt Builder模式
                        // 多角色主题模式参数
                        useMultiCharacter: useMultiCharacterMode || false, // 是否启用多角色主题模式
                        themeId: useMultiCharacterMode ? selectedThemeId : undefined, // 主题ID（仅多角色模式）
                        letAIChooseCharacters: useMultiCharacterMode ? letAIChooseCharacters : undefined // AI自动选择角色
                    })
                });
                clearTimeout(timeoutId);
                progressPollingActive = false; // 停止轮询
                clearInterval(progressInterval);
                
                console.log('[Comic] Response received, status:', response.status);
                const data = await response.json();
                console.log('[Comic] Data parsed, success:', data.success);
                
                document.getElementById('comicModal').classList.remove('active');
                
                if (data.success) {
                    currentComicData = data.comic; // 缓存漫画数据用于布局切换
                    displayComic(data.comic);
                    console.log('[Comic] Generated with', data.comic.panels?.length || 0, 'panels');
                    
                    // 如果是长图文格式且有HTML，显示长图文预览
                    if (selectedOutputFormat === 'vertical-scroll' && data.scrollHtml) {
                        showScrollComicPreview(data.scrollHtml);
                    }
                } else {
                    console.log('[Comic] Generation failed, trying text version:', data.error);
                    // 生成失败，先显示错误提示，再尝试文字版
                    showComicError(data.error || '漫画生成失败', true); // true = 可重试
                }
            } catch (error) {
                progressPollingActive = false; // 停止轮询
                clearInterval(progressInterval);
                comicAbortController = null;
                // 确保在任何异常情况下都关闭模态框
                const modal = document.getElementById('comicModal');
                if (modal) modal.classList.remove('active');
                
                if (error.name === 'AbortError') {
                    console.log('[Comic] Generation aborted (user or timeout)');
                    // 区分用户主动取消 vs 超时
                    showComicError('漫画生成超时，请稍后重试。建议选择"标准模式"以获得更稳定的生成体验。', true);
                    return;
                }
                console.error('[Comic] Generate error:', error);
                showComicError('漫画生成出现异常: ' + (error.message || '未知错误'), true);
            }
        }
        
        // 显示漫画生成错误提示（新增函数）
        function showComicError(message, canRetry = false) {
            // 确保模态框关闭
            const modal = document.getElementById('comicModal');
            if (modal) modal.classList.remove('active');
            
            if (canRetry) {
                const retry = confirm('\u274c ' + message + '\\n\\n点击"确定"重新尝试生成\\n点击"取消"查看文字版漫画');
                if (retry) {
                    // 用户选择重试
                    showComicConfigModal();
                } else {
                    // 用户选择文字版
                    generateComicText();
                }
            } else {
                alert('\u274c ' + message);
            }
        }
        
        // 强制重新生成漫画（忽略缓存）
        async function forceRegenerateComic() {
            if (!currentReportId) {
                alert('请等待分析完成');
                return;
            }
            
            // 设置强制重新生成标志
            forceRegenerateFlag = true;
            
            // 显示配置弹窗让用户选择模式
            showComicConfigModal();
        }
        
        // 直接强制重新生成（跳过缓存检查）
        async function executeForceRegenerate() {
            if (!currentReportId) return;
            
            const modal = document.getElementById('comicModal');
            modal.classList.add('active');
            
            const charName = useMultiCharacterMode 
                ? (themeNames[selectedThemeId] || selectedThemeId) + '（多角色）'
                : (characterNames[selectedCharacterId] || selectedCharacterId);
            const modeLabel = window.useNanoBananaMode ? 'Nano Banana模式' : window.usePromptBuilderMode ? 'Prompt Builder模式' : '标准模式';
            
            // 显示进度提示并启动真实进度轮询
            const progressText = modal.querySelector('#comicModalStatus') || modal.querySelector('p:last-child');
            if (progressText) progressText.textContent = '正在用"' + charName + '"重新生成漫画（' + modeLabel + '），预计需要1-2分钟...';
            
            // 缓存脚本信息
            let scriptInfo = null;
            
            // 更新进度条UI的函数
            function updateProgressUI(progress) {
                if (!progressText) return;
                
                const percent = progress.percent || 0;
                
                // 如果收到脚本摘要，缓存它
                if (progress.scriptSummary) {
                    scriptInfo = progress.scriptSummary;
                }
                
                // 构建进度显示文本
                let displayMessage = progress.message || '生成中...';
                
                // 添加角色信息（脚本完成后）
                if (progress.stage === 'script_done' && scriptInfo && scriptInfo.charactersUsed) {
                    const charList = scriptInfo.charactersUsed.slice(0, 5).join('、');
                    const charExtra = scriptInfo.charactersUsed.length > 5 ? '等' : '';
                    displayMessage += '\\n📚 角色阵容：' + charList + charExtra;
                }
                
                // 面板进度信息
                const panelInfo = progress.currentPanel && progress.totalPanels 
                    ? ' (' + progress.currentPanel + '/' + progress.totalPanels + '页)' 
                    : '';
                
                // 更新进度条
                const progressBar = modal.querySelector('#comicProgressBar');
                if (progressBar) {
                    progressBar.style.width = percent + '%';
                    // 根据进度阶段设置颜色
                    if (percent < 20) {
                        progressBar.style.backgroundColor = '#3b82f6'; // blue
                    } else if (percent < 55) {
                        progressBar.style.backgroundColor = '#8b5cf6'; // purple
                    } else if (percent < 90) {
                        progressBar.style.backgroundColor = '#ec4899'; // pink
                    } else {
                        progressBar.style.backgroundColor = '#22c55e'; // green
                    }
                }
                
                // 更新文本
                progressText.innerHTML = displayMessage + panelInfo + ' <span class="text-yellow-400">[' + percent + '%]</span>';
            }
            
            // 轮询进度API（每2秒）
            let progressPollingActive = true;
            const progressInterval = setInterval(async () => {
                if (!progressPollingActive) return;
                
                try {
                    const progressResponse = await fetch('/api/reports/' + currentReportId + '/comic/progress');
                    const progressData = await progressResponse.json();
                    
                    if (progressData.success && progressData.progress) {
                        updateProgressUI(progressData.progress);
                        console.log('[Comic Progress]', progressData.progress);
                        
                        // 如果进度显示失败，停止轮询并显示错误
                        if (progressData.progress.stage === 'failed') {
                            progressPollingActive = false;
                            clearInterval(progressInterval);
                            modal.classList.remove('active');
                            showComicError(progressData.progress.message || '漫画生成失败', true);
                        }
                    }
                } catch (e) {
                    // 忽略轮询错误
                    console.log('[Comic Progress] Polling error:', e);
                }
            }, 2000);
            
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                };
                
                // 创建 AbortController 用于停止生成（3分钟超时）
                comicAbortController = new AbortController();
                const timeoutId = setTimeout(() => {
                    clearInterval(progressInterval);
                    comicAbortController.abort();
                }, 180000);
                
                console.log('[Comic] Force regenerate: Sending POST request...');
                // 根据模式正确设置 characterSetId 和 mainCharacterId
                const forceCharacterSetId = useMultiCharacterMode ? selectedThemeId : selectedCharacterSet;
                const forceMainCharacterId = useMultiCharacterMode ? 'multi' : selectedCharacterId;
                console.log('[Comic] Force regenerate params:', { useMultiCharacterMode, forceCharacterSetId, forceMainCharacterId, selectedThemeId });
                
                const response = await fetch(\`/api/reports/\${currentReportId}/comic\`, {
                    method: 'POST',
                    headers,
                    signal: comicAbortController.signal,
                    body: JSON.stringify({
                        style: useMultiCharacterMode ? 'multi-character' : (selectedCharacterSet === 'nezha-movie' ? 'nezha' : 'business'),
                        characterSetId: forceCharacterSetId,
                        mainCharacterId: forceMainCharacterId,
                        contentStyle: selectedContentStyle, // 内容风格
                        outputFormat: selectedOutputFormat,
                        forceRegenerate: true, // 强制重新生成
                        useNanoBanana: window.useNanoBananaMode || false,
                        usePromptBuilderMode: window.usePromptBuilderMode || false,
                        // 多角色主题模式参数
                        useMultiCharacter: useMultiCharacterMode || false,
                        themeId: useMultiCharacterMode ? selectedThemeId : undefined,
                        letAIChooseCharacters: useMultiCharacterMode ? letAIChooseCharacters : undefined
                    })
                });
                clearTimeout(timeoutId);
                progressPollingActive = false; // 停止轮询
                clearInterval(progressInterval);
                console.log('[Comic] Force regenerate: Response received, status:', response.status);
                comicAbortController = null; // 清除 controller
                const data = await response.json();
                console.log('[Comic] Force regenerate: Data parsed, success:', data.success);
                modal.classList.remove('active');
                
                if (data.success) {
                    currentComicData = data.comic;
                    displayComic(data.comic);
                    console.log('[Comic] Force regenerated with', data.comic.panels?.length || 0, 'panels');
                    
                    // 显示生成统计
                    if (data.generationStats) {
                        const stats = data.generationStats;
                        if (stats.failedPanels > 0) {
                            // 检查是否是配额不足导致的失败
                            const hasQuotaError = stats.failureDetails && stats.failureDetails.some(function(d) { return d && d.errorType === 'quota_exceeded'; });
                            if (hasQuotaError) {
                                alert('漫画生成失败！\\n\\n原因：API配额不足\\n\\n请联系管理员充值后重试。');
                            } else {
                                alert('漫画生成完成！\\n成功: ' + stats.successPanels + '格\\n失败: ' + stats.failedPanels + '格\\n\\n失败的面板可能需要调整提示词后重试。');
                            }
                        }
                    }
                } else {
                    showComicError('漫画生成失败: ' + (data.error || '未知错误'), true);
                }
            } catch (error) {
                progressPollingActive = false; // 停止轮询
                clearInterval(progressInterval);
                comicAbortController = null;
                // 确保模态框关闭
                const modalEl = document.getElementById('comicModal');
                if (modalEl) modalEl.classList.remove('active');
                
                if (error.name === 'AbortError') {
                    console.log('[Comic] Force regenerate aborted (user or timeout)');
                    showComicError('漫画生成超时，请稍后重试。建议选择"标准模式"以获得更稳定的生成体验。', true);
                    return;
                }
                console.error('[Comic] Force regenerate error:', error);
                showComicError('漫画生成失败: ' + (error.message || '请稍后重试'), true);
            }
        }
        
        // 显示长图文预览
        function showScrollComicPreview(htmlContent) {
            // 创建预览弹窗
            const previewModal = document.createElement('div');
            previewModal.id = 'scrollComicPreview';
            previewModal.className = 'modal active';
            previewModal.innerHTML = \`
                <div class="card rounded-xl p-4 max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold gold-text">长图文预览（适合微信公众号）</h3>
                        <div class="flex gap-2">
                            <button onclick="downloadScrollComic()" class="btn-gold px-4 py-2 rounded-lg text-sm">
                                <i class="fas fa-download mr-1"></i>下载HTML
                            </button>
                            <button onclick="closeScrollComicPreview()" class="text-gray-400 hover:text-white px-2">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="overflow-auto flex-1 bg-white rounded-lg">
                        <iframe id="scrollComicFrame" class="w-full h-full min-h-[600px]" srcdoc="\${htmlContent.replace(/"/g, '&quot;')}"></iframe>
                    </div>
                </div>
            \`;
            document.body.appendChild(previewModal);
            
            // 保存HTML内容供下载
            window.currentScrollComicHtml = htmlContent;
        }
        
        function closeScrollComicPreview() {
            const preview = document.getElementById('scrollComicPreview');
            if (preview) preview.remove();
        }
        
        function downloadScrollComic() {
            if (!window.currentScrollComicHtml) return;
            
            const blob = new Blob([window.currentScrollComicHtml], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`\${name || code}_财报漫画_长图文.html\`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        // 生成文字版漫画
        async function generateComicText() {
            try {
                const response = await fetch(\`/api/reports/\${currentReportId}/comic-text\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    displayComicText(data.comicText);
                } else {
                    alert('漫画生成失败: ' + data.error);
                }
            } catch (error) {
                console.error('Generate comic text error:', error);
                alert('漫画生成失败，请稍后重试');
            }
        }
        
        // 当前漫画数据缓存
        let currentComicData = null;
        
        // 加载已有漫画
        async function loadComic() {
            try {
                const response = await fetch(\`/api/reports/\${currentReportId}/comic\`);
                const data = await response.json();
                
                if (data.success) {
                    currentComicData = data.comic; // 缓存漫画数据用于布局切换
                    displayComic(data.comic);
                    document.getElementById('viewComicBtn').classList.remove('hidden');
                    document.getElementById('generateComicBtn').classList.add('hidden');
                }
            } catch (error) {
                console.error('Load comic error:', error);
            }
        }
        
        // 显示漫画 - 支持长图布局（单列/双列）
        function displayComic(comic) {
            const comicSection = document.getElementById('comicSection');
            const comicContent = document.getElementById('comicContent');
            const comicSummary = document.getElementById('comicSummary');
            
            comicSection.classList.remove('hidden');
            
            const panels = comic.panels || [];
            const panelCount = panels.length;
            const companyName = currentReport?.companyName || name || '公司';
            const layout = selectedDisplayLayout; // 'single-column' or 'double-column'
            
            // 判断是否为多角色漫画
            const isMultiCharacter = comic.isMultiCharacter || comic.mainCharacterId === 'multi';
            
            // 获取角色/主题信息
            let charName, charSubtitle, charIcon;
            if (isMultiCharacter) {
                // 多角色模式：显示主题名称
                const themeName = themeNames[comic.characterSetId] || themeNames[comic.themeId] || comic.characterSetId || '多角色';
                charName = themeName;
                // 如果有角色列表，显示角色阵容
                if (comic.charactersUsed && comic.charactersUsed.length > 0) {
                    const charList = comic.charactersUsed.slice(0, 4).map(c => c.displayName || c.name).join('、');
                    const extra = comic.charactersUsed.length > 4 ? '等' : '';
                    charSubtitle = charList + extra + ' 联合演绎';
                } else {
                    charSubtitle = '多角色联合演绎';
                }
                charIcon = 'fa-users';
            } else {
                // 单角色模式：显示角色名称
                charName = characterNames[comic.mainCharacterId] || characterNames[selectedCharacterId] || comic.mainCharacter?.name || '财报解读官';
                charSubtitle = '为您解读';
                charIcon = 'fa-user-tie';
            }
            
            // 根据布局选择样式
            const isSingleColumn = layout === 'single-column';
            
            // 生成长图头部
            const headerHtml = \`
                <div class="comic-long-header w-full bg-gradient-to-br from-yellow-600 via-yellow-500 to-yellow-400 rounded-t-2xl p-6 text-center relative overflow-hidden">
                    <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjIiIGZpbGw9InJnYmEoMCwwLDAsMC4xKSIvPjwvZz48L3N2Zz4=')] opacity-30"></div>
                    <div class="relative z-10">
                        <div class="text-4xl font-bold text-black mb-2">\${companyName}</div>
                        <div class="text-lg text-black/80 mb-4">财报漫画解读</div>
                        <div class="inline-flex items-center gap-3 bg-black/20 px-4 py-2 rounded-full">
                            <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg">
                                <i class="fas \${charIcon} text-yellow-600 text-lg"></i>
                            </div>
                            <div class="text-left">
                                <div class="text-sm font-bold text-white">\${charName}</div>
                                <div class="text-xs text-white/70">\${charSubtitle}</div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
            
            // 解析错误图片URL的辅助函数
            function parseErrorImage(url) {
                if (!url || !url.startsWith('placeholder://error/')) return null;
                const parts = url.replace('placeholder://error/', '').split('/');
                if (parts.length < 3) return null;
                try {
                    return {
                        panelIndex: parseInt(parts[0], 10),
                        errorType: parts[1],
                        errorMessage: decodeURIComponent(atob(parts[2])),
                    };
                } catch (e) {
                    return null;
                }
            }
            
            // 获取友好的错误提示
            function getFriendlyErrorMessage(errorType) {
                const messages = {
                    'api_error': '图片生成服务暂时不可用，请点击“重新生成”按钮重试',
                    'safety_filter': '图片内容需要优化，请点击“重新生成”按钮重试',
                    'no_image': '图片生成未成功，请点击“重新生成”按钮重试',
                    'timeout': '图片生成超时，请点击“重新生成”按钮重试',
                    'quota_exceeded': 'API配额不足，请联系管理员充值后重试',
                    'unknown': '图片生成遇到问题，请点击“重新生成”按钮重试',
                };
                return messages[errorType] || messages['unknown'];
            }
            
            // 生成面板HTML - 长图样式
            const panelsHtml = panels.map((panel, index) => {
                // 检查图片状态：正常图片 / 错误图片 / 占位图
                const errorInfo = parseErrorImage(panel.imageUrl);
                const isErrorImage = !!errorInfo;
                const hasImage = panel.imageUrl && !panel.imageUrl.includes('placeholder') && !isErrorImage;
                const moodColors = {
                    '积极': { bg: 'from-green-900/30 to-green-800/20', border: 'border-green-500/50', badge: 'bg-green-500' },
                    '谨慎': { bg: 'from-orange-900/30 to-orange-800/20', border: 'border-orange-500/50', badge: 'bg-orange-500' },
                    '紧张': { bg: 'from-red-900/30 to-red-800/20', border: 'border-red-500/50', badge: 'bg-red-500' },
                    '中性': { bg: 'from-blue-900/30 to-blue-800/20', border: 'border-blue-500/50', badge: 'bg-blue-500' }
                };
                const mood = moodColors[panel.mood] || moodColors['中性'];
                
                // 单列布局：大图+详细文字
                if (isSingleColumn) {
                    return \`
                    <div class="comic-long-panel relative bg-gradient-to-br \${mood.bg} \${mood.border} border-l-4 p-5 transition-all duration-300 hover:shadow-lg">
                        <!-- 面板编号和标题 -->
                        <div class="flex items-center gap-3 mb-4">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-black font-bold text-lg shadow-md">\${index + 1}</div>
                            <div class="flex-1">
                                <div class="text-lg font-bold text-white">\${panel.caption || '第' + (index + 1) + '章'}</div>
                            </div>
                            \${panel.mood ? \`<span class="px-2 py-1 \${mood.badge} text-white text-xs rounded-full">\${panel.mood}</span>\` : ''}
                        </div>
                        
                        <!-- 图片区域 - 大图展示 -->
                        <div class="mb-4">
                            \${hasImage ? 
                                \`<img src="\${panel.imageUrl}" alt="漫画面板 \${index + 1}" 
                                    class="w-full max-h-[400px] object-contain rounded-xl border-2 border-gray-600 hover:border-yellow-500 transition-colors cursor-pointer shadow-lg"
                                    onclick="window.open('\${panel.imageUrl}', '_blank')"
                                    loading="lazy">\` : 
                                isErrorImage ?
                                \`<div class="w-full h-64 bg-gradient-to-br from-red-900/30 to-gray-900 rounded-xl flex items-center justify-center border-2 border-red-500/50">
                                    <div class="text-center p-4">
                                        <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-3"></i>
                                        <p class="text-sm text-red-300 mb-2">第\${index + 1}格图片生成失败</p>
                                        <p class="text-xs text-gray-400">\${getFriendlyErrorMessage(errorInfo.errorType)}</p>
                                    </div>
                                </div>\` :
                                \`<div class="w-full h-64 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center border-2 border-gray-600">
                                    <div class="text-center p-4">
                                        <i class="fas fa-image text-4xl text-gray-600 mb-2"></i>
                                        <p class="text-sm text-gray-500">\${panel.scene || '图片加载中...'}</p>
                                    </div>
                                </div>\`
                            }
                        </div>
                        
                        <!-- 对话框 - 醒目展示 -->
                        \${panel.dialogue ? \`
                            <div class="bg-gradient-to-r from-yellow-600/20 to-yellow-500/10 border-l-4 border-yellow-500 p-4 rounded-r-lg mb-3">
                                <div class="flex items-start gap-3">
                                    <i class="fas fa-comment-dots text-yellow-500 text-xl mt-1"></i>
                                    <div class="text-base gold-text italic font-medium leading-relaxed">"\${panel.dialogue}"</div>
                                </div>
                            </div>
                        \` : ''}
                        
                        <!-- 视觉隐喻提示 -->
                        \${panel.visualMetaphor ? \`
                            <div class="flex items-start gap-2 p-3 bg-gray-800/50 rounded-lg">
                                <i class="fas fa-lightbulb text-yellow-500 mt-0.5"></i>
                                <span class="text-sm text-gray-300">\${panel.visualMetaphor}</span>
                            </div>
                        \` : ''}
                    </div>
                    \`;
                } else {
                    // 双列布局：完整显示图片
                    return \`
                    <div class="comic-grid-panel relative bg-gradient-to-br \${mood.bg} rounded-xl \${mood.border} border overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02]">
                        <!-- 面板编号角标 -->
                        <div class="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-black font-bold text-sm shadow-lg">\${index + 1}</div>
                        \${panel.mood ? \`<span class="absolute top-3 right-3 z-10 px-2 py-1 \${mood.badge} text-white text-xs rounded-full shadow">\${panel.mood}</span>\` : ''}
                        
                        <!-- 图片区域 - 完整显示不裁剪 -->
                        <div class="relative bg-gradient-to-br from-gray-800/50 to-gray-900/50">
                            \${hasImage ? 
                                \`<img src="\${panel.imageUrl}" alt="漫画面板 \${index + 1}" 
                                    class="w-full h-auto object-contain cursor-pointer"
                                    style="min-height: 300px; max-height: 600px;"
                                    onclick="window.open('\${panel.imageUrl}', '_blank')"
                                    loading="lazy">\` : 
                                isErrorImage ?
                                \`<div class="w-full bg-gradient-to-br from-red-900/30 to-gray-900 flex items-center justify-center" style="min-height: 300px;">
                                    <div class="text-center p-4">
                                        <i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-2"></i>
                                        <p class="text-xs text-red-300 mb-1">生成失败</p>
                                        <p class="text-xs text-gray-500">请重新生成</p>
                                    </div>
                                </div>\` :
                                \`<div class="w-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center" style="min-height: 300px;">
                                    <div class="text-center p-4">
                                        <i class="fas fa-image text-3xl text-gray-600 mb-2"></i>
                                        <p class="text-xs text-gray-500">图片加载中</p>
                                    </div>
                                </div>\`
                            }
                        </div>
                        
                        <!-- 文字内容区域 -->
                        <div class="p-4 bg-gradient-to-b from-transparent to-gray-900/80">
                            <div class="text-sm font-bold text-white mb-2">\${panel.caption || ''}</div>
                            \${panel.dialogue ? \`
                                <div class="text-xs gold-text italic border-l-2 border-yellow-500 pl-2">"\${panel.dialogue}"</div>
                            \` : ''}
                        </div>
                    </div>
                    \`;
                }
            }).join('');
            
            // 生成财务亮点
            let highlightsHtml = '';
            if (comic.financialHighlights?.length > 0) {
                highlightsHtml = \`
                    <div class="comic-highlights p-5 bg-gradient-to-r from-gray-800/70 to-gray-900/70 \${isSingleColumn ? '' : 'col-span-2'}">
                        <div class="text-base font-bold gold-text mb-3"><i class="fas fa-chart-line mr-2"></i>财务数据亮点</div>
                        <div class="flex flex-wrap gap-2">
                            \${comic.financialHighlights.map(h => \`
                                <span class="px-3 py-1.5 bg-gradient-to-r from-yellow-600/25 to-yellow-500/15 text-yellow-300 text-sm rounded-full border border-yellow-600/30">
                                    <i class="fas fa-check-circle mr-1 text-xs"></i>\${h}
                                </span>
                            \`).join('')}
                        </div>
                    </div>
                \`;
            }
            
            // 生成长图底部
            const footerHtml = \`
                <div class="comic-long-footer w-full bg-gradient-to-br from-gray-800 to-gray-900 rounded-b-2xl p-6 text-center \${isSingleColumn ? '' : 'col-span-2'}">
                    \${comic.summary ? \`
                        <div class="flex items-start gap-3 p-4 bg-gradient-to-r from-yellow-600/15 to-transparent rounded-lg border border-yellow-600/30 mb-4 text-left">
                            <i class="fas fa-comment-dollar gold-text text-xl mt-0.5"></i>
                            <div>
                                <div class="text-xs text-gray-500 mb-1">投资总结</div>
                                <span class="text-gray-200">\${comic.summary}</span>
                            </div>
                        </div>
                    \` : ''}
                    <div class="text-xs text-gray-500">
                        <i class="fas fa-magic mr-1"></i>由 Finspark AI 生成 | 共 \${panelCount} 格漫画
                    </div>
                </div>
            \`;
            
            // 统计失败的面板
            const failedPanelCount = panels.filter(p => {
                const errorInfo = parseErrorImage(p.imageUrl);
                return errorInfo || (p.imageUrl && p.imageUrl.includes('placeholder'));
            }).length;
            
            // 布局切换按钮 + 重新生成按钮
            const layoutSwitchHtml = \`
                <div class="flex flex-col items-center gap-3 mb-4 \${isSingleColumn ? '' : 'col-span-2'}">
                    <div class="flex justify-center gap-3">
                        <button onclick="switchComicLayout('single-column')" class="px-4 py-2 rounded-lg text-sm transition-all \${isSingleColumn ? 'bg-yellow-600 text-black font-bold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}">
                            <i class="fas fa-list mr-1"></i>单列长图
                        </button>
                        <button onclick="switchComicLayout('double-column')" class="px-4 py-2 rounded-lg text-sm transition-all \${!isSingleColumn ? 'bg-blue-600 text-white font-bold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}">
                            <i class="fas fa-th-large mr-1"></i>双列网格
                        </button>
                    </div>
                    \${failedPanelCount > 0 ? \`
                        <div class="flex items-center gap-2 text-red-400 text-sm">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>\${failedPanelCount}个面板生成失败</span>
                        </div>
                    \` : ''}
                    <button onclick="forceRegenerateComic()" class="px-4 py-2 rounded-lg text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg">
                        <i class="fas fa-sync-alt mr-1"></i>重新生成漫画
                    </button>
                </div>
            \`;
            
            // 组装完整内容
            if (isSingleColumn) {
                // 单列布局：一整个长卡片
                comicContent.className = 'flex flex-col max-w-2xl mx-auto';
                comicContent.innerHTML = \`
                    <div class="comic-long-card rounded-2xl overflow-hidden shadow-2xl border border-yellow-600/30">
                        \${headerHtml}
                        <div class="comic-panels-container bg-gradient-to-b from-gray-900 via-gray-850 to-gray-900 divide-y divide-gray-700/50">
                            \${panelsHtml}
                        </div>
                        \${highlightsHtml}
                        \${footerHtml}
                    </div>
                    \${layoutSwitchHtml}
                \`;
            } else {
                // 双列布局：2x4网格
                comicContent.className = 'flex flex-col';
                comicContent.innerHTML = \`
                    <div class="comic-grid-card rounded-2xl overflow-hidden shadow-2xl border border-blue-600/30 max-w-4xl mx-auto w-full">
                        \${headerHtml}
                        <div class="grid grid-cols-2 gap-0 bg-gradient-to-b from-gray-900 to-gray-850">
                            \${panelsHtml}
                        </div>
                        \${highlightsHtml}
                        \${footerHtml}
                    </div>
                    \${layoutSwitchHtml}
                \`;
            }
            
            comicSummary.innerHTML = '';
            
            document.getElementById('viewComicBtn').classList.remove('hidden');
            document.getElementById('generateComicBtn').classList.add('hidden');
            
            // 滚动到漫画区域
            comicSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // 切换漫画布局
        function switchComicLayout(layout) {
            selectedDisplayLayout = layout;
            // 重新渲染当前漫画（使用缓存数据）
            if (currentComicData) {
                displayComic(currentComicData);
            } else if (currentReport && currentReport.comic) {
                displayComic(currentReport.comic);
            } else {
                // 重新加载漫画
                loadComic();
            }
        }
        
        // 显示文字版漫画
        function displayComicText(text) {
            const comicSection = document.getElementById('comicSection');
            const comicContent = document.getElementById('comicContent');
            const comicSummary = document.getElementById('comicSummary');
            
            comicSection.classList.remove('hidden');
            
            comicContent.innerHTML = \`
                <div class="col-span-2 comic-panel p-6">
                    <pre class="whitespace-pre-wrap text-gray-300 text-sm leading-relaxed">\${text}</pre>
                </div>
            \`;
            
            comicSummary.textContent = '文字版漫画解读';
        }
        
        // 辅助函数
        function getScoreColor(score) {
            if (score >= 80) return 'text-green-500';
            if (score >= 60) return 'text-yellow-500';
            if (score >= 40) return 'text-orange-500';
            return 'text-red-500';
        }
        
        function getActionColor(action) {
            const actionLower = (action || '').toLowerCase();
            // 支持中英文
            if (actionLower.includes('强烈推荐') || actionLower.includes('强烈买入') || actionLower === 'strong_buy') return 'text-green-400';
            if (actionLower.includes('买入') || actionLower.includes('推荐') || actionLower === 'buy') return 'text-green-500';
            if (actionLower.includes('持有') || actionLower === 'hold') return 'text-yellow-500';
            if (actionLower.includes('观望') || actionLower.includes('谨慎')) return 'text-orange-500';
            if (actionLower.includes('卖出') || actionLower.includes('回避') || actionLower === 'sell') return 'text-red-500';
            return 'text-gray-400';
        }
        
        function formatAction(action) {
            if (!action || action === '--') return '--';
            // 如果已经是中文，直接返回
            const chineseActions = ['强烈推荐', '强烈买入', '买入', '推荐', '持有', '观望', '谨慎', '卖出', '回避', '强烈卖出', '待分析'];
            if (chineseActions.some(a => action.includes(a))) return action;
            // 英文映射
            const map = { strong_buy: '强烈买入', buy: '买入', hold: '持有', sell: '卖出', strong_sell: '强烈卖出' };
            return map[action] || action || '--';
        }
        
        function formatInvestor(type) {
            if (!type || type === '--') return '--';
            // 如果已经是中文，直接返回
            const chineseTypes = ['稳健型', '价值型', '平衡型', '激进型', '成长型'];
            if (chineseTypes.some(t => type.includes(t))) return type;
            // 英文映射
            const map = { conservative: '稳健型', value: '价值型', balanced: '平衡型', growth: '成长型', aggressive: '激进型' };
            return map[type] || type || '--';
        }
        
        function formatValuation(val) {
            if (!val || val === '--') return '--';
            // 如果已经是中文，直接返回
            const chineseVals = ['低估', '合理偏低', '合理', '适中', '偏高', '高估', '具有长期价值', '价值有限', '待评估'];
            if (chineseVals.some(v => val.includes(v))) return val;
            // 英文映射
            const map = { undervalued: '低估', fair: '合理', overvalued: '高估', 'slightly_undervalued': '合理偏低' };
            return map[val] || val || '--';
        }
        
        function formatRiskLevel(level) {
            const map = { low: '低', moderate: '中等', high: '高', critical: '严重' };
            return map[level] || '--';
        }
        
        // 事件绑定
        document.getElementById('exportPdfBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            togglePdfDropdown();
        });
        document.getElementById('exportPdfBasic').addEventListener('click', function() {
            document.getElementById('pdfDropdownMenu').classList.add('hidden');
            exportPDF(false);
        });
        document.getElementById('exportPdfWithComic').addEventListener('click', function() {
            document.getElementById('pdfDropdownMenu').classList.add('hidden');
            exportPDF(true);
        });
        document.getElementById('generateComicBtn').addEventListener('click', showComicConfigModal);
        document.getElementById('viewComicBtn').addEventListener('click', () => {
            document.getElementById('comicSection').scrollIntoView({ behavior: 'smooth' });
        });
        
        // 🆕 股票走势面板脚本（提前初始化，确保面板准备就绪）
        ` + stockMarketPanelScript + `
        
        // 🆕 立即加载股票走势面板数据（不等待分析完成）
        if (code && window.StockMarketPanel) {
            console.log('[Main] 页面加载完成，立即加载股票面板数据:', code);
            window.StockMarketPanel.loadData(code, 90); // 默认加载3个月数据
        }
        
        // 启动分析（面板初始化后才执行，确保可以安全调用loadData）
        startAnalysis();
    </script>
    
    <!-- 悬浮智能问数助手 -->
    ${floatingAssistantHtml}
    ${floatingAssistantScript}
</body>
</html>
  `);
});

// ============ 我的报告页面 ============
app.get('/my-reports', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的分析 - Finspark 投资分析</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Noto Sans SC', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh; }
        .gold-text { color: #d4af37; }
        .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 50%, #d4af37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(212, 175, 55, 0.2); transition: all 0.3s ease; }
        .card:hover { border-color: #d4af37; transform: translateY(-2px); box-shadow: 0 4px 20px rgba(212, 175, 55, 0.1); }
        .btn-gold { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 100%); color: #0a0a0a; font-weight: 600; }
        .btn-outline { border: 1px solid rgba(212, 175, 55, 0.5); color: #d4af37; }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.1); }
        .stats-card { background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); }
        .filter-input { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; }
        .filter-input:focus { border-color: #d4af37; outline: none; box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2); }
        .checkbox-custom { appearance: none; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-radius: 4px; background: transparent; cursor: pointer; }
        .checkbox-custom:checked { background: #d4af37; border-color: #d4af37; background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='black' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e"); }
        .toast { animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .toast-out { animation: fadeOut 0.3s ease forwards; }
        ${responsiveStyles}
    </style>
</head>
<body class="text-white">
    <!-- 桌面端导航栏 -->
    <nav class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800 hide-on-mobile">
        <div class="container-adaptive py-4 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-3">
                <i class="fas fa-chart-line text-2xl gold-text"></i>
                <span class="text-xl font-bold gold-gradient">Finspark 投资分析</span>
            </a>
            <div class="flex items-center space-x-6">
                <a href="/" class="text-gray-400 hover:text-white">首页</a>
                <a href="/my-reports" class="gold-text font-medium">我的分析</a>
                <a href="/favorites" class="text-gray-400 hover:text-white">我的收藏</a>
                <a href="/account" class="text-gray-400 hover:text-white">账号设置</a>
            </div>
        </div>
    </nav>
    
    <!-- 移动端导航栏 -->
    <nav class="mobile-nav show-on-mobile bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div class="px-4 py-3 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-2">
                <i class="fas fa-chart-line text-xl gold-text"></i>
                <span class="text-lg font-bold gold-gradient">Finspark</span>
            </a>
            <div class="flex items-center space-x-2">
                <a href="/" class="p-2 text-gray-400 hover:text-white touch-target">
                    <i class="fas fa-home text-lg"></i>
                </a>
                <a href="/favorites" class="p-2 text-gray-400 hover:text-white touch-target">
                    <i class="fas fa-heart text-lg"></i>
                </a>
            </div>
        </div>
    </nav>

    <main class="pt-adaptive-header pb-8 md:pb-16">
        <div class="container-adaptive">
            <!-- 页面标题 -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
                <h1 class="text-2xl md:text-3xl font-bold gold-gradient"><i class="fas fa-chart-pie mr-2 md:mr-3"></i>我的分析</h1>
                <a href="/" class="btn-gold px-4 py-2 rounded-lg text-sm hover:shadow-lg transition-all w-full sm:w-auto text-center"><i class="fas fa-plus mr-2"></i>新建分析</a>
            </div>
            
            <!-- 统计卡片 -->
            <div id="statsSection" class="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6 hidden">
                <div class="stats-card rounded-xl p-3 md:p-4 text-center">
                    <div class="text-xl md:text-3xl font-bold gold-text" id="totalAnalyses">0</div>
                    <div class="text-xs md:text-sm text-gray-400">总分析数</div>
                </div>
                <div class="stats-card rounded-xl p-3 md:p-4 text-center">
                    <div class="text-xl md:text-3xl font-bold text-green-400" id="completedCount">0</div>
                    <div class="text-xs md:text-sm text-gray-400">已完成</div>
                </div>
                <div class="stats-card rounded-xl p-3 md:p-4 text-center">
                    <div class="text-xl md:text-3xl font-bold gold-text" id="comicCount">0</div>
                    <div class="text-xs md:text-sm text-gray-400">漫画解读</div>
                </div>
            </div>
            
            <!-- 筛选工具栏 -->
            <div id="filterToolbar" class="hidden mb-4 md:mb-6 p-3 md:p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                <div class="flex flex-wrap items-center gap-3">
                    <!-- 日期范围 -->
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500">日期</span>
                        <input type="date" id="startDate" class="filter-input px-3 py-1.5 rounded-lg text-sm w-36">
                        <span class="text-gray-600">-</span>
                        <input type="date" id="endDate" class="filter-input px-3 py-1.5 rounded-lg text-sm w-36">
                    </div>
                    
                    <!-- 报告类型 -->
                    <select id="reportTypeFilter" class="filter-input px-3 py-1.5 rounded-lg text-sm">
                        <option value="">全部类型</option>
                        <option value="annual">年报</option>
                        <option value="quarterly">季报</option>
                    </select>
                    
                    <!-- 状态 -->
                    <select id="statusFilter" class="filter-input px-3 py-1.5 rounded-lg text-sm">
                        <option value="">全部状态</option>
                        <option value="completed">已完成</option>
                        <option value="processing">处理中</option>
                        <option value="failed">失败</option>
                    </select>
                    
                    <!-- 搜索框 -->
                    <div class="relative flex-1 min-w-[180px] max-w-xs">
                        <input type="text" id="searchInput" placeholder="搜索公司名称/代码..." 
                               class="filter-input w-full px-4 py-1.5 pl-9 rounded-lg text-sm">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"></i>
                    </div>
                    
                    <!-- 排序 -->
                    <select id="sortSelect" class="filter-input px-3 py-1.5 rounded-lg text-sm">
                        <option value="created_at:desc">最新优先</option>
                        <option value="created_at:asc">最早优先</option>
                        <option value="company_name:asc">公司名 A-Z</option>
                        <option value="company_name:desc">公司名 Z-A</option>
                        <option value="health_score:desc">评分高到低</option>
                        <option value="health_score:asc">评分低到高</option>
                    </select>
                    
                    <!-- 重置 -->
                    <button onclick="resetFilters()" class="px-3 py-1.5 text-gray-400 hover:text-yellow-500 transition-colors text-sm">
                        <i class="fas fa-redo mr-1"></i>重置
                    </button>
                </div>
            </div>
            
            <!-- 批量操作栏 -->
            <div id="batchActionBar" class="hidden mb-4">
                <div class="flex items-center gap-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()" class="checkbox-custom">
                        <span class="text-sm text-gray-300">全选</span>
                    </label>
                    <span class="text-yellow-500 text-sm">
                        已选择 <span id="selectedCount" class="font-semibold">0</span> 项
                    </span>
                    <div class="flex-1"></div>
                    <button onclick="cancelSelection()" class="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors">
                        取消选择
                    </button>
                    <button onclick="batchDelete()" class="px-4 py-1.5 bg-red-500/20 text-red-400 text-sm rounded-lg hover:bg-red-500/30 transition-colors">
                        <i class="fas fa-trash mr-1"></i>删除选中
                    </button>
                </div>
            </div>
            
            <!-- 需要登录提示 -->
            <div id="needLogin" class="card rounded-xl p-8 text-center hidden">
                <i class="fas fa-lock text-5xl gold-text mb-4"></i>
                <h3 class="text-xl font-semibold mb-2">请先登录</h3>
                <p class="text-gray-400 mb-6">登录后即可查看您的分析历史记录</p>
                <a href="/" class="btn-gold px-8 py-3 rounded-lg inline-block">返回首页登录</a>
            </div>
            
            <!-- 报告列表 -->
            <div id="reportsList" class="space-y-3">
                <div class="card rounded-xl p-6 text-center text-gray-400">
                    <i class="fas fa-spinner fa-spin mr-2"></i>加载中...
                </div>
            </div>
            
            <!-- 空状态 -->
            <div id="emptyState" class="card rounded-xl p-12 text-center hidden">
                <i class="fas fa-chart-pie text-5xl gold-text mb-4"></i>
                <h3 class="text-xl font-semibold mb-2" id="emptyTitle">还没有分析记录</h3>
                <p class="text-gray-400 mb-6" id="emptyDesc">开始分析您感兴趣的企业财报吧</p>
                <a href="/" class="btn-gold px-8 py-3 rounded-lg inline-block">开始分析</a>
            </div>
            
            <!-- 分页 -->
            <div id="pagination" class="flex items-center justify-center gap-2 mt-6 hidden"></div>
        </div>
    </main>

    <script>
        // 状态管理
        let currentPage = 1;
        let totalPages = 1;
        let totalRecords = 0;
        const pageSize = 15;
        let selectedIds = new Set();
        let currentFilters = {};
        let debounceTimer = null;
        let availableFilters = { reportTypes: [], statuses: [] };
        
        // 初始化
        document.addEventListener('DOMContentLoaded', () => {
            initFilters();
            loadReports();
        });
        
        // 初始化筛选器事件
        function initFilters() {
            document.getElementById('startDate').addEventListener('change', applyFilters);
            document.getElementById('endDate').addEventListener('change', applyFilters);
            document.getElementById('reportTypeFilter').addEventListener('change', applyFilters);
            document.getElementById('statusFilter').addEventListener('change', applyFilters);
            document.getElementById('sortSelect').addEventListener('change', applyFilters);
            
            // 搜索框防抖
            document.getElementById('searchInput').addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(applyFilters, 300);
            });
            
            // 回车搜索
            document.getElementById('searchInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(debounceTimer);
                    applyFilters();
                }
            });
        }
        
        // 应用筛选
        function applyFilters() {
            currentPage = 1;
            selectedIds.clear();
            updateBatchActionBar();
            
            const [sortBy, sortOrder] = document.getElementById('sortSelect').value.split(':');
            
            currentFilters = {
                startDate: document.getElementById('startDate').value || undefined,
                endDate: document.getElementById('endDate').value || undefined,
                reportType: document.getElementById('reportTypeFilter').value || undefined,
                status: document.getElementById('statusFilter').value || undefined,
                search: document.getElementById('searchInput').value.trim() || undefined,
                sortBy,
                sortOrder,
            };
            
            loadReports();
        }
        
        // 重置筛选
        function resetFilters() {
            document.getElementById('startDate').value = '';
            document.getElementById('endDate').value = '';
            document.getElementById('reportTypeFilter').value = '';
            document.getElementById('statusFilter').value = '';
            document.getElementById('searchInput').value = '';
            document.getElementById('sortSelect').value = 'created_at:desc';
            
            currentFilters = {};
            currentPage = 1;
            selectedIds.clear();
            updateBatchActionBar();
            loadReports();
        }
        
        // 加载报告
        async function loadReports() {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                document.getElementById('needLogin').classList.remove('hidden');
                document.getElementById('reportsList').classList.add('hidden');
                document.getElementById('statsSection').classList.add('hidden');
                document.getElementById('filterToolbar').classList.add('hidden');
                return;
            }
            
            // 显示加载状态
            document.getElementById('reportsList').innerHTML = \`
                <div class="card rounded-xl p-8 text-center text-gray-400">
                    <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>加载中...</p>
                </div>
            \`;
            document.getElementById('emptyState').classList.add('hidden');
            
            try {
                // 加载统计
                const statsResponse = await fetch('/api/user/stats', {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const statsData = await statsResponse.json();
                if (statsData.success) {
                    document.getElementById('statsSection').classList.remove('hidden');
                    document.getElementById('totalAnalyses').textContent = statsData.stats.analyses || 0;
                    document.getElementById('completedCount').textContent = statsData.stats.analyses || 0;
                    document.getElementById('comicCount').textContent = statsData.stats.comics || 0;
                }
                
                // 构建查询参数
                const params = new URLSearchParams({ page: currentPage, limit: pageSize });
                Object.entries(currentFilters).forEach(([key, value]) => {
                    if (value) params.append(key, value);
                });
                
                const response = await fetch(\`/api/user/history?\${params}\`, {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await response.json();
                
                if (!data.success) {
                    if (response.status === 401 || data.needLogin) {
                        document.getElementById('needLogin').classList.remove('hidden');
                        document.getElementById('reportsList').classList.add('hidden');
                        document.getElementById('statsSection').classList.add('hidden');
                        document.getElementById('filterToolbar').classList.add('hidden');
                        return;
                    }
                    throw new Error(data.error);
                }
                
                // 显示筛选工具栏
                document.getElementById('filterToolbar').classList.remove('hidden');
                
                // 更新可用筛选选项
                if (data.filters) {
                    availableFilters = data.filters;
                }
                
                totalRecords = data.total;
                totalPages = Math.ceil(data.total / pageSize);
                
                if (data.history.length === 0) {
                    document.getElementById('reportsList').classList.add('hidden');
                    document.getElementById('emptyState').classList.remove('hidden');
                    document.getElementById('pagination').classList.add('hidden');
                    
                    // 根据是否有筛选条件显示不同文案
                    const hasFilters = Object.values(currentFilters).some(v => v);
                    document.getElementById('emptyTitle').textContent = hasFilters ? '没有找到匹配的记录' : '还没有分析记录';
                    document.getElementById('emptyDesc').textContent = hasFilters ? '尝试调整筛选条件' : '开始分析您感兴趣的企业财报吧';
                    return;
                }
                
                document.getElementById('emptyState').classList.add('hidden');
                document.getElementById('reportsList').classList.remove('hidden');
                renderReports(data.history);
                renderPagination();
                
            } catch (error) {
                console.error('Load reports error:', error);
                document.getElementById('reportsList').innerHTML = \`
                    <div class="card rounded-xl p-6 text-center text-red-400">
                        <i class="fas fa-exclamation-triangle mr-2"></i>加载失败: \${error.message}
                    </div>
                \`;
            }
        }
        
        // 渲染报告列表
        function renderReports(reports) {
            document.getElementById('reportsList').innerHTML = reports.map(report => \`
                <div class="card rounded-xl p-4 hover:bg-white/5 transition-all">
                    <div class="flex items-center gap-4">
                        <!-- 复选框 -->
                        <input type="checkbox" class="checkbox-custom report-checkbox" 
                               data-id="\${report.id}"
                               \${selectedIds.has(report.id) ? 'checked' : ''}
                               onchange="toggleSelect(\${report.id})">
                        
                        <!-- 主信息 -->
                        <div class="flex-1 min-w-0 cursor-pointer" onclick="viewReport(\${report.id}, '\${report.company_code}', '\${encodeURIComponent(report.company_name)}')">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="font-semibold text-white truncate">\${report.company_name}</span>
                                <span class="text-xs text-gray-500">\${report.company_code}</span>
                                <span class="px-2 py-0.5 text-xs rounded \${report.report_type === 'annual' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}">
                                    \${report.report_type === 'annual' ? '年报' : '季报'}
                                </span>
                            </div>
                            <div class="flex items-center gap-3 text-sm text-gray-500">
                                <span><i class="far fa-calendar mr-1"></i>\${formatDate(report.created_at)}</span>
                                \${report.report_period ? \`<span>报告期: \${report.report_period}</span>\` : ''}
                                \${report.view_count ? \`<span><i class="far fa-eye mr-1"></i>\${report.view_count}</span>\` : ''}
                            </div>
                        </div>
                        
                        <!-- 健康评分 -->
                        \${report.health_score ? \`
                            <div class="text-center px-3">
                                <div class="text-2xl font-bold \${getScoreColor(report.health_score)}">\${report.health_score}</div>
                                <div class="text-xs text-gray-500">评分</div>
                            </div>
                        \` : '<div class="w-16"></div>'}
                        
                        <!-- 状态 -->
                        <div class="px-3 py-1 rounded-full text-xs \${getStatusClass(report.status)}">
                            \${formatStatus(report.status)}
                        </div>
                        
                        <!-- 操作按钮 -->
                        <div class="flex items-center gap-1">
                            \${report.comic_status === 'completed' ? \`
                                <button onclick="event.stopPropagation(); viewComic(\${report.id})" 
                                        class="p-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition" title="查看漫画">
                                    <i class="fas fa-palette"></i>
                                </button>
                            \` : ''}
                            <button onclick="viewReport(\${report.id}, '\${report.company_code}', '\${encodeURIComponent(report.company_name)}')" 
                                    class="p-2 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition" title="查看报告">
                                <i class="fas fa-chart-line"></i>
                            </button>
                            <button onclick="event.stopPropagation(); deleteSingle(\${report.id})" 
                                    class="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="删除">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            \`).join('');
        }
        
        // 渲染分页
        function renderPagination() {
            if (totalPages <= 1) {
                document.getElementById('pagination').classList.add('hidden');
                return;
            }
            
            document.getElementById('pagination').classList.remove('hidden');
            let html = '';
            
            // 上一页
            html += \`<button onclick="goToPage(\${currentPage - 1})" 
                       class="px-3 py-1.5 rounded-lg border border-gray-700 \${currentPage === 1 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:border-yellow-500'}"
                       \${currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>\`;
            
            // 页码
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);
            
            if (startPage > 1) {
                html += \`<button onclick="goToPage(1)" class="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">1</button>\`;
                if (startPage > 2) html += \`<span class="text-gray-600 px-1">...</span>\`;
            }
            
            for (let i = startPage; i <= endPage; i++) {
                html += \`<button onclick="goToPage(\${i})" 
                           class="px-3 py-1.5 rounded-lg \${i === currentPage ? 'bg-yellow-500 text-black font-semibold' : 'text-gray-400 hover:text-white hover:bg-gray-800'}">
                    \${i}
                </button>\`;
            }
            
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += \`<span class="text-gray-600 px-1">...</span>\`;
                html += \`<button onclick="goToPage(\${totalPages})" class="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">\${totalPages}</button>\`;
            }
            
            // 下一页
            html += \`<button onclick="goToPage(\${currentPage + 1})" 
                       class="px-3 py-1.5 rounded-lg border border-gray-700 \${currentPage === totalPages ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:border-yellow-500'}"
                       \${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>\`;
            
            // 总数
            html += \`<span class="ml-4 text-sm text-gray-500">共 \${totalRecords} 条</span>\`;
            
            document.getElementById('pagination').innerHTML = html;
        }
        
        function goToPage(page) {
            if (page < 1 || page > totalPages) return;
            currentPage = page;
            loadReports();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        // 选择相关
        function toggleSelect(id) {
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
            } else {
                selectedIds.add(id);
            }
            updateBatchActionBar();
            updateCheckboxUI();
        }
        
        function toggleSelectAll() {
            const checkboxes = document.querySelectorAll('.report-checkbox');
            const selectAll = document.getElementById('selectAllCheckbox');
            
            if (selectAll.checked) {
                checkboxes.forEach(cb => {
                    cb.checked = true;
                    selectedIds.add(parseInt(cb.dataset.id));
                });
            } else {
                checkboxes.forEach(cb => cb.checked = false);
                selectedIds.clear();
            }
            updateBatchActionBar();
        }
        
        function cancelSelection() {
            selectedIds.clear();
            document.querySelectorAll('.report-checkbox').forEach(cb => cb.checked = false);
            document.getElementById('selectAllCheckbox').checked = false;
            updateBatchActionBar();
        }
        
        function updateBatchActionBar() {
            const bar = document.getElementById('batchActionBar');
            const count = document.getElementById('selectedCount');
            
            if (selectedIds.size > 0) {
                bar.classList.remove('hidden');
                count.textContent = selectedIds.size;
            } else {
                bar.classList.add('hidden');
            }
        }
        
        function updateCheckboxUI() {
            const checkboxes = document.querySelectorAll('.report-checkbox');
            const selectAll = document.getElementById('selectAllCheckbox');
            
            let allChecked = true;
            checkboxes.forEach(cb => {
                const id = parseInt(cb.dataset.id);
                cb.checked = selectedIds.has(id);
                if (!cb.checked) allChecked = false;
            });
            
            selectAll.checked = checkboxes.length > 0 && allChecked;
        }
        
        // 删除相关
        async function deleteSingle(id) {
            if (!confirm('确定要删除这条记录吗？')) return;
            
            const token = localStorage.getItem('accessToken');
            try {
                const response = await fetch(\`/api/user/history/\${id}\`, {
                    method: 'DELETE',
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await response.json();
                
                if (data.success) {
                    showToast('删除成功', 'success');
                    loadReports();
                } else {
                    showToast(data.error || '删除失败', 'error');
                }
            } catch (error) {
                showToast('删除失败: ' + error.message, 'error');
            }
        }
        
        async function batchDelete() {
            if (selectedIds.size === 0) return;
            
            if (!confirm(\`确定要删除选中的 \${selectedIds.size} 条记录吗？此操作不可恢复。\`)) return;
            
            const token = localStorage.getItem('accessToken');
            try {
                const response = await fetch('/api/user/history/batch-delete', {
                    method: 'POST',
                    headers: {
                        'Authorization': \`Bearer \${token}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ids: Array.from(selectedIds) })
                });
                const data = await response.json();
                
                if (data.success) {
                    showToast(\`已删除 \${data.deletedCount} 条记录\`, 'success');
                    selectedIds.clear();
                    updateBatchActionBar();
                    loadReports();
                } else {
                    showToast(data.error || '删除失败', 'error');
                }
            } catch (error) {
                showToast('删除失败: ' + error.message, 'error');
            }
        }
        
        function viewReport(id, code, name) {
            window.location.href = \`/analysis?code=\${code}&name=\${decodeURIComponent(name)}&reportId=\${id}\`;
        }
        
        function viewComic(reportId) {
            // TODO: 实现漫画查看
            showToast('漫画查看功能开发中', 'info');
        }
        
        // 工具函数
        function getScoreColor(score) {
            if (!score) return 'text-gray-400';
            if (score >= 80) return 'text-green-400';
            if (score >= 60) return 'text-yellow-400';
            return 'text-red-400';
        }
        
        function getStatusClass(status) {
            const classes = {
                completed: 'bg-green-500/20 text-green-400',
                processing: 'bg-blue-500/20 text-blue-400',
                failed: 'bg-red-500/20 text-red-400',
                pending: 'bg-gray-500/20 text-gray-400'
            };
            return classes[status] || 'bg-gray-500/20 text-gray-400';
        }
        
        function formatStatus(status) {
            const map = { completed: '已完成', processing: '处理中', failed: '失败', pending: '等待中' };
            return map[status] || status;
        }
        
        function formatDate(date) {
            const d = new Date(date);
            const now = new Date();
            const diff = now - d;
            
            if (diff < 60000) return '刚刚';
            if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
            if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
            if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
            
            return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
        }
        
        function showToast(message, type = 'info') {
            const colors = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                info: 'bg-blue-500',
                warning: 'bg-yellow-500'
            };
            
            const toast = document.createElement('div');
            toast.className = \`toast fixed bottom-4 right-4 \${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50\`;
            toast.innerHTML = \`<i class="fas fa-\${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>\${message}\`;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.add('toast-out');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    </script>
</body>
</html>
  `);
});

// ============ 我的收藏页面（增强版） ============
app.get('/favorites', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的收藏 - Finspark 投资分析</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Noto Sans SC', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh; }
        .gold-text { color: #d4af37; }
        .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 50%, #d4af37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(212, 175, 55, 0.2); transition: all 0.3s; }
        .card:hover { border-color: #d4af37; transform: translateY(-2px); box-shadow: 0 4px 20px rgba(212, 175, 55, 0.1); }
        .card.selected { border-color: #d4af37; background: rgba(212, 175, 55, 0.05); }
        .btn-gold { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 100%); color: #0a0a0a; font-weight: 600; transition: all 0.3s; }
        .btn-gold:hover { transform: scale(1.02); }
        .btn-outline { border: 1px solid rgba(212, 175, 55, 0.5); color: #d4af37; transition: all 0.3s; }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.1); }
        .btn-secondary { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); }
        .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
        .input-field { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); }
        .input-field:focus { border-color: #d4af37; outline: none; }
        .group-item { padding: 8px 12px; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
        .group-item:hover { background: rgba(212, 175, 55, 0.1); }
        .group-item.active { background: rgba(212, 175, 55, 0.2); color: #d4af37; }
        .modal { position: fixed; inset: 0; z-index: 100; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); }
        .modal.active { display: flex; }
        .modal-content { background: #1a1a2e; border: 1px solid rgba(212, 175, 55, 0.3); }
        .checkbox-custom { appearance: none; width: 18px; height: 18px; border: 2px solid rgba(212, 175, 55, 0.5); border-radius: 4px; cursor: pointer; position: relative; }
        .checkbox-custom:checked { background: #d4af37; border-color: #d4af37; }
        .checkbox-custom:checked::after { content: '✓'; position: absolute; color: #0a0a0a; font-size: 12px; font-weight: bold; top: 50%; left: 50%; transform: translate(-50%, -50%); }
        .tag-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(212, 175, 55, 0.2); color: #d4af37; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide { animation: slideIn 0.3s ease-out; }
        ${responsiveStyles}
    </style>
</head>
<body class="text-white">
    <!-- 桌面端导航栏 -->
    <nav class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800 hide-on-mobile">
        <div class="container-adaptive py-4 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-3">
                <i class="fas fa-chart-line text-2xl gold-text"></i>
                <span class="text-xl font-bold gold-gradient">Finspark 投资分析</span>
            </a>
            <div class="flex items-center space-x-6">
                <a href="/" class="text-gray-400 hover:text-white">首页</a>
                <a href="/my-reports" class="text-gray-400 hover:text-white">我的分析</a>
                <a href="/favorites" class="gold-text font-medium">我的收藏</a>
                <a href="/account" class="text-gray-400 hover:text-white">账号设置</a>
            </div>
        </div>
    </nav>
    
    <!-- 移动端导航栏 -->
    <nav class="mobile-nav show-on-mobile bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div class="px-4 py-3 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-2">
                <i class="fas fa-chart-line text-xl gold-text"></i>
                <span class="text-lg font-bold gold-gradient">Finspark</span>
            </a>
            <div class="flex items-center space-x-2">
                <a href="/" class="p-2 text-gray-400 hover:text-white touch-target">
                    <i class="fas fa-home text-lg"></i>
                </a>
                <a href="/my-reports" class="p-2 text-gray-400 hover:text-white touch-target">
                    <i class="fas fa-chart-pie text-lg"></i>
                </a>
            </div>
        </div>
    </nav>

    <main class="pt-adaptive-header pb-8 md:pb-16">
        <div class="container-adaptive">
            <!-- 页面标题与操作 -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
                <h1 class="text-2xl md:text-3xl font-bold gold-gradient"><i class="fas fa-heart mr-2 md:mr-3"></i>我的收藏</h1>
                <div class="flex items-center gap-3">
                    <span id="favCount" class="text-sm text-gray-400">0 个收藏</span>
                    <button onclick="toggleSelectMode()" id="selectModeBtn" class="btn-secondary px-3 py-1.5 rounded-lg text-sm">
                        <i class="fas fa-check-square mr-1"></i>批量操作
                    </button>
                </div>
            </div>
            
            <!-- 需要登录提示 -->
            <div id="needLogin" class="card rounded-xl p-8 text-center hidden">
                <i class="fas fa-lock text-5xl gold-text mb-4"></i>
                <h3 class="text-xl font-semibold mb-2">请先登录</h3>
                <p class="text-gray-400 mb-6">登录后即可收藏您感兴趣的股票</p>
                <a href="/" class="btn-gold px-8 py-3 rounded-lg inline-block">返回首页登录</a>
            </div>
            
            <!-- 主内容区 -->
            <div id="mainContent" class="flex gap-6">
                <!-- 左侧分组列表 -->
                <div class="w-56 flex-shrink-0">
                    <div class="card rounded-xl p-4 sticky top-24">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-sm font-semibold text-gray-400">分组</h3>
                            <button onclick="showCreateGroupModal()" class="text-gray-500 hover:text-gold-text p-1" title="新建分组">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                        <div id="groupList" class="space-y-1">
                            <div class="group-item active" onclick="selectGroup(null)" data-group-id="">
                                <i class="fas fa-layer-group mr-2 text-gray-400"></i>全部收藏
                                <span class="float-right text-xs text-gray-500" id="allCount">0</span>
                            </div>
                            <div class="group-item" onclick="selectGroup(0)" data-group-id="0">
                                <i class="fas fa-inbox mr-2 text-gray-400"></i>未分组
                                <span class="float-right text-xs text-gray-500" id="ungroupedCount">0</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 右侧内容 -->
                <div class="flex-1 min-w-0">
                    <!-- 筛选栏 -->
                    <div class="card rounded-xl p-4 mb-4">
                        <div class="flex flex-wrap items-center gap-3">
                            <!-- 搜索框 -->
                            <div class="relative flex-1 min-w-[200px]">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"></i>
                                <input type="text" id="searchInput" placeholder="搜索股票代码或名称..." 
                                       class="input-field w-full pl-10 pr-4 py-2 rounded-lg text-sm"
                                       onkeyup="handleSearch(event)">
                            </div>
                            <!-- 排序 -->
                            <select id="sortSelect" onchange="loadFavorites()" class="input-field px-3 py-2 rounded-lg text-sm cursor-pointer">
                                <option value="created_at:desc">最新收藏</option>
                                <option value="created_at:asc">最早收藏</option>
                                <option value="stock_name:asc">名称 A-Z</option>
                                <option value="stock_name:desc">名称 Z-A</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- 批量操作栏 -->
                    <div id="batchBar" class="card rounded-xl p-3 mb-4 hidden bg-gradient-to-r from-yellow-900/20 to-transparent">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <input type="checkbox" id="selectAllCheckbox" class="checkbox-custom" onchange="toggleSelectAll()">
                                <span class="text-sm"><span id="selectedCount">0</span> 项已选</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="showMoveToGroupModal()" class="btn-secondary px-3 py-1.5 rounded text-xs">
                                    <i class="fas fa-folder mr-1"></i>移动到分组
                                </button>
                                <button onclick="batchDelete()" class="bg-red-500/20 text-red-400 px-3 py-1.5 rounded text-xs hover:bg-red-500/30">
                                    <i class="fas fa-trash mr-1"></i>批量删除
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 收藏列表 -->
                    <div id="favoritesList" class="grid md:grid-cols-2 gap-4">
                        <div class="card rounded-xl p-6 text-center text-gray-400 col-span-2">
                            <i class="fas fa-spinner fa-spin mr-2"></i>加载中...
                        </div>
                    </div>
                    
                    <!-- 分页 -->
                    <div id="pagination" class="flex items-center justify-center gap-2 mt-6 hidden">
                        <button onclick="changePage('prev')" id="prevBtn" class="btn-secondary px-3 py-1.5 rounded text-sm disabled:opacity-50" disabled>
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <span class="text-sm text-gray-400">
                            第 <span id="currentPage">1</span> / <span id="totalPages">1</span> 页
                        </span>
                        <button onclick="changePage('next')" id="nextBtn" class="btn-secondary px-3 py-1.5 rounded text-sm disabled:opacity-50">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                    
                    <!-- 空状态 -->
                    <div id="emptyState" class="card rounded-xl p-12 text-center hidden">
                        <i class="fas fa-star text-5xl gold-text mb-4"></i>
                        <h3 class="text-xl font-semibold mb-2">还没有收藏</h3>
                        <p class="text-gray-400 mb-6">在分析页面点击收藏按钮，即可将股票加入收藏</p>
                        <a href="/" class="btn-gold px-8 py-3 rounded-lg inline-block">去搜索股票</a>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <!-- 创建分组弹窗 -->
    <div id="createGroupModal" class="modal">
        <div class="modal-content rounded-xl p-6 max-w-md w-full mx-4 animate-slide">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold gold-text">新建分组</h3>
                <button onclick="hideModal('createGroupModal')" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">分组名称</label>
                    <input type="text" id="newGroupName" maxlength="20" placeholder="输入分组名称..."
                           class="input-field w-full px-4 py-2 rounded-lg">
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">分组颜色</label>
                    <div class="flex gap-2">
                        <button type="button" class="w-8 h-8 rounded-full border-2 border-white" style="background: #d4af37;" onclick="selectGroupColor('#d4af37')"></button>
                        <button type="button" class="w-8 h-8 rounded-full border-2 border-transparent" style="background: #3b82f6;" onclick="selectGroupColor('#3b82f6')"></button>
                        <button type="button" class="w-8 h-8 rounded-full border-2 border-transparent" style="background: #10b981;" onclick="selectGroupColor('#10b981')"></button>
                        <button type="button" class="w-8 h-8 rounded-full border-2 border-transparent" style="background: #f59e0b;" onclick="selectGroupColor('#f59e0b')"></button>
                        <button type="button" class="w-8 h-8 rounded-full border-2 border-transparent" style="background: #ef4444;" onclick="selectGroupColor('#ef4444')"></button>
                        <button type="button" class="w-8 h-8 rounded-full border-2 border-transparent" style="background: #8b5cf6;" onclick="selectGroupColor('#8b5cf6')"></button>
                    </div>
                </div>
                <div id="createGroupError" class="text-red-400 text-sm hidden"></div>
                <button onclick="createGroup()" class="btn-gold w-full py-2 rounded-lg">创建分组</button>
            </div>
        </div>
    </div>
    
    <!-- 移动到分组弹窗 -->
    <div id="moveToGroupModal" class="modal">
        <div class="modal-content rounded-xl p-6 max-w-md w-full mx-4 animate-slide">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold gold-text">移动到分组</h3>
                <button onclick="hideModal('moveToGroupModal')" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="moveGroupList" class="space-y-2 max-h-60 overflow-y-auto">
                <!-- 动态填充 -->
            </div>
            <div id="moveGroupError" class="text-red-400 text-sm hidden mt-3"></div>
        </div>
    </div>

    <script>
        let currentPage = 1;
        let totalPages = 1;
        let currentGroupId = null;
        let isSelectMode = false;
        let selectedIds = new Set();
        let groups = [];
        let selectedGroupColor = '#d4af37';
        const PAGE_SIZE = 20;
        
        async function loadFavorites() {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                document.getElementById('needLogin').classList.remove('hidden');
                document.getElementById('mainContent').classList.add('hidden');
                return;
            }
            
            try {
                const sortValue = document.getElementById('sortSelect').value;
                const [sortBy, sortOrder] = sortValue.split(':');
                const search = document.getElementById('searchInput').value.trim();
                
                let url = \`/api/favorites?page=\${currentPage}&limit=\${PAGE_SIZE}&sortBy=\${sortBy}&sortOrder=\${sortOrder}\`;
                if (currentGroupId !== null) url += \`&groupId=\${currentGroupId}\`;
                if (search) url += \`&search=\${encodeURIComponent(search)}\`;
                
                const response = await fetch(url, {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await response.json();
                
                if (!data.success) {
                    if (response.status === 401) {
                        document.getElementById('needLogin').classList.remove('hidden');
                        document.getElementById('mainContent').classList.add('hidden');
                        return;
                    }
                    throw new Error(data.error);
                }
                
                groups = data.groups || [];
                renderGroups();
                
                document.getElementById('favCount').textContent = data.total + ' 个收藏';
                document.getElementById('allCount').textContent = data.total;
                
                // 计算未分组数量
                const ungroupedCount = data.favorites.filter(f => !f.group_id).length;
                document.getElementById('ungroupedCount').textContent = ungroupedCount;
                
                if (data.favorites.length === 0) {
                    document.getElementById('emptyState').classList.remove('hidden');
                    document.getElementById('favoritesList').classList.add('hidden');
                    document.getElementById('pagination').classList.add('hidden');
                    return;
                }
                
                document.getElementById('emptyState').classList.add('hidden');
                document.getElementById('favoritesList').classList.remove('hidden');
                
                // 渲染列表
                document.getElementById('favoritesList').innerHTML = data.favorites.map(fav => \`
                    <div class="card rounded-xl p-5 \${selectedIds.has(fav.id) ? 'selected' : ''}" data-fav-id="\${fav.id}">
                        <div class="flex items-start gap-3">
                            \${isSelectMode ? \`
                                <input type="checkbox" class="checkbox-custom mt-1" \${selectedIds.has(fav.id) ? 'checked' : ''}
                                       onchange="toggleSelect(\${fav.id})">
                            \` : ''}
                            <div class="flex-1 cursor-pointer" onclick="goAnalysis('\${fav.stock_code}', '\${encodeURIComponent(fav.stock_name)}')">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="text-lg font-semibold gold-text">\${fav.stock_name}</span>
                                    \${fav.is_pinned ? '<i class="fas fa-thumbtack text-yellow-500 text-xs"></i>' : ''}
                                    \${fav.group_id ? \`<span class="tag-badge">\${getGroupName(fav.group_id)}</span>\` : ''}
                                </div>
                                <div class="text-sm text-gray-400">\${fav.stock_code}</div>
                                <div class="text-xs text-gray-500 mt-1">
                                    收藏于 \${formatDate(fav.created_at)}
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="goAnalysis('\${fav.stock_code}', '\${encodeURIComponent(fav.stock_name)}')" 
                                        class="btn-gold px-3 py-1 rounded text-sm">
                                    <i class="fas fa-chart-line mr-1"></i>分析
                                </button>
                                <button onclick="removeFavorite(\${fav.id})" 
                                        class="p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                        \${fav.notes ? \`
                            <div class="mt-3 text-sm text-gray-400 bg-gray-800/50 rounded-lg p-3">
                                <i class="fas fa-sticky-note mr-2 text-yellow-500"></i>\${fav.notes}
                            </div>
                        \` : ''}
                    </div>
                \`).join('');
                
                // 分页
                totalPages = Math.ceil(data.total / PAGE_SIZE);
                document.getElementById('currentPage').textContent = currentPage;
                document.getElementById('totalPages').textContent = totalPages;
                document.getElementById('prevBtn').disabled = currentPage <= 1;
                document.getElementById('nextBtn').disabled = currentPage >= totalPages;
                document.getElementById('pagination').classList.toggle('hidden', totalPages <= 1);
                
            } catch (error) {
                document.getElementById('favoritesList').innerHTML = \`
                    <div class="card rounded-xl p-6 text-center text-red-400 col-span-2">
                        <i class="fas fa-exclamation-triangle mr-2"></i>加载失败: \${error.message}
                    </div>
                \`;
            }
        }
        
        function renderGroups() {
            const groupListEl = document.getElementById('groupList');
            const defaultItems = groupListEl.querySelectorAll('.group-item[data-group-id=""], .group-item[data-group-id="0"]');
            
            // 移除自定义分组
            groupListEl.querySelectorAll('.group-item:not([data-group-id=""]):not([data-group-id="0"])').forEach(el => el.remove());
            
            // 添加自定义分组
            groups.forEach(group => {
                const el = document.createElement('div');
                el.className = \`group-item \${currentGroupId === group.id ? 'active' : ''}\`;
                el.setAttribute('data-group-id', group.id);
                el.onclick = () => selectGroup(group.id);
                el.innerHTML = \`
                    <i class="fas fa-folder mr-2" style="color: \${group.color}"></i>\${group.name}
                    <span class="float-right text-xs text-gray-500">\${group.item_count || 0}</span>
                \`;
                groupListEl.appendChild(el);
            });
        }
        
        function getGroupName(groupId) {
            const group = groups.find(g => g.id === groupId);
            return group ? group.name : '';
        }
        
        function selectGroup(groupId) {
            currentGroupId = groupId;
            currentPage = 1;
            
            document.querySelectorAll('.group-item').forEach(el => {
                const elGroupId = el.getAttribute('data-group-id');
                el.classList.toggle('active', 
                    (groupId === null && elGroupId === '') || 
                    (String(groupId) === elGroupId)
                );
            });
            
            loadFavorites();
        }
        
        function toggleSelectMode() {
            isSelectMode = !isSelectMode;
            selectedIds.clear();
            updateSelectedCount();
            
            const btn = document.getElementById('selectModeBtn');
            btn.classList.toggle('btn-gold', isSelectMode);
            btn.classList.toggle('btn-secondary', !isSelectMode);
            btn.innerHTML = isSelectMode 
                ? '<i class="fas fa-times mr-1"></i>取消' 
                : '<i class="fas fa-check-square mr-1"></i>批量操作';
            
            document.getElementById('batchBar').classList.toggle('hidden', !isSelectMode);
            loadFavorites();
        }
        
        function toggleSelect(id) {
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
            } else {
                selectedIds.add(id);
            }
            updateSelectedCount();
            
            const card = document.querySelector(\`[data-fav-id="\${id}"]\`);
            if (card) card.classList.toggle('selected', selectedIds.has(id));
        }
        
        function toggleSelectAll() {
            const checkboxes = document.querySelectorAll('#favoritesList .checkbox-custom');
            const selectAll = document.getElementById('selectAllCheckbox').checked;
            
            checkboxes.forEach(cb => {
                const card = cb.closest('[data-fav-id]');
                const id = parseInt(card.getAttribute('data-fav-id'));
                cb.checked = selectAll;
                card.classList.toggle('selected', selectAll);
                if (selectAll) {
                    selectedIds.add(id);
                } else {
                    selectedIds.delete(id);
                }
            });
            updateSelectedCount();
        }
        
        function updateSelectedCount() {
            document.getElementById('selectedCount').textContent = selectedIds.size;
        }
        
        function showCreateGroupModal() {
            document.getElementById('newGroupName').value = '';
            document.getElementById('createGroupError').classList.add('hidden');
            selectedGroupColor = '#d4af37';
            document.querySelectorAll('#createGroupModal button[style*="background"]').forEach((btn, i) => {
                btn.classList.toggle('border-white', i === 0);
                btn.classList.toggle('border-transparent', i !== 0);
            });
            document.getElementById('createGroupModal').classList.add('active');
        }
        
        function selectGroupColor(color) {
            selectedGroupColor = color;
            document.querySelectorAll('#createGroupModal button[style*="background"]').forEach(btn => {
                btn.classList.toggle('border-white', btn.style.background === color);
                btn.classList.toggle('border-transparent', btn.style.background !== color);
            });
        }
        
        async function createGroup() {
            const name = document.getElementById('newGroupName').value.trim();
            if (!name) {
                document.getElementById('createGroupError').textContent = '请输入分组名称';
                document.getElementById('createGroupError').classList.remove('hidden');
                return;
            }
            
            const token = localStorage.getItem('accessToken');
            try {
                const response = await fetch('/api/favorites/groups', {
                    method: 'POST',
                    headers: { 
                        'Authorization': \`Bearer \${token}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, color: selectedGroupColor })
                });
                const data = await response.json();
                
                if (data.success) {
                    hideModal('createGroupModal');
                    loadFavorites();
                } else {
                    document.getElementById('createGroupError').textContent = data.error || '创建失败';
                    document.getElementById('createGroupError').classList.remove('hidden');
                }
            } catch (error) {
                document.getElementById('createGroupError').textContent = '创建失败: ' + error.message;
                document.getElementById('createGroupError').classList.remove('hidden');
            }
        }
        
        function showMoveToGroupModal() {
            if (selectedIds.size === 0) {
                alert('请先选择要移动的收藏');
                return;
            }
            
            const list = document.getElementById('moveGroupList');
            list.innerHTML = \`
                <div class="group-item p-3 rounded-lg hover:bg-gray-700/50" onclick="moveToGroup(null)">
                    <i class="fas fa-inbox mr-2 text-gray-400"></i>移出分组
                </div>
                \${groups.map(g => \`
                    <div class="group-item p-3 rounded-lg hover:bg-gray-700/50" onclick="moveToGroup(\${g.id})">
                        <i class="fas fa-folder mr-2" style="color: \${g.color}"></i>\${g.name}
                    </div>
                \`).join('')}
            \`;
            document.getElementById('moveGroupError').classList.add('hidden');
            document.getElementById('moveToGroupModal').classList.add('active');
        }
        
        async function moveToGroup(groupId) {
            const token = localStorage.getItem('accessToken');
            try {
                const response = await fetch('/api/favorites/batch/move', {
                    method: 'POST',
                    headers: { 
                        'Authorization': \`Bearer \${token}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        ids: Array.from(selectedIds),
                        groupId: groupId
                    })
                });
                const data = await response.json();
                
                if (data.success) {
                    hideModal('moveToGroupModal');
                    selectedIds.clear();
                    updateSelectedCount();
                    loadFavorites();
                } else {
                    document.getElementById('moveGroupError').textContent = data.error || '移动失败';
                    document.getElementById('moveGroupError').classList.remove('hidden');
                }
            } catch (error) {
                document.getElementById('moveGroupError').textContent = '移动失败: ' + error.message;
                document.getElementById('moveGroupError').classList.remove('hidden');
            }
        }
        
        async function batchDelete() {
            if (selectedIds.size === 0) {
                alert('请先选择要删除的收藏');
                return;
            }
            
            if (!confirm(\`确定要删除这 \${selectedIds.size} 个收藏吗？\`)) return;
            
            const token = localStorage.getItem('accessToken');
            const errors = [];
            
            for (const id of selectedIds) {
                try {
                    const response = await fetch(\`/api/favorites/\${id}\`, {
                        method: 'DELETE',
                        headers: { 'Authorization': \`Bearer \${token}\` }
                    });
                    const data = await response.json();
                    if (!data.success) errors.push(id);
                } catch (e) {
                    errors.push(id);
                }
            }
            
            if (errors.length > 0) {
                alert(\`部分删除失败 (\${errors.length}个)\`);
            }
            
            selectedIds.clear();
            updateSelectedCount();
            loadFavorites();
        }
        
        function hideModal(id) {
            document.getElementById(id).classList.remove('active');
        }
        
        function handleSearch(e) {
            if (e.key === 'Enter') {
                currentPage = 1;
                loadFavorites();
            }
        }
        
        function changePage(dir) {
            if (dir === 'prev' && currentPage > 1) {
                currentPage--;
            } else if (dir === 'next' && currentPage < totalPages) {
                currentPage++;
            }
            loadFavorites();
        }
        
        function goAnalysis(code, name) {
            window.location.href = \`/analysis?code=\${code}&name=\${decodeURIComponent(name)}\`;
        }
        
        async function removeFavorite(id) {
            if (!confirm('确定要移除这个收藏吗？')) return;
            
            const token = localStorage.getItem('accessToken');
            try {
                const response = await fetch(\`/api/favorites/\${id}\`, {
                    method: 'DELETE',
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const data = await response.json();
                if (data.success) {
                    loadFavorites();
                } else {
                    alert(data.error || '移除失败');
                }
            } catch (error) {
                alert('移除失败: ' + error.message);
            }
        }
        
        function formatDate(date) {
            const d = new Date(date);
            return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        
        loadFavorites();
    </script>
</body>
</html>
  `);
});

// ============ 账号设置页面 ============
app.get('/account', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>账号设置 - Finspark 投资分析</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Noto Sans SC', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh; }
        .gold-text { color: #d4af37; }
        .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 50%, #d4af37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(212, 175, 55, 0.2); }
        .btn-gold { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 100%); color: #0a0a0a; font-weight: 600; transition: all 0.3s; }
        .btn-gold:hover { transform: scale(1.02); }
        .btn-outline { border: 1px solid rgba(212, 175, 55, 0.5); color: #d4af37; transition: all 0.3s; }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.1); }
        .input-field { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; }
        .input-field:focus { border-color: #d4af37; outline: none; }
        .tier-card { background: rgba(212, 175, 55, 0.05); border: 1px solid rgba(212, 175, 55, 0.2); }
        .tier-card.active { background: rgba(212, 175, 55, 0.15); border-color: #d4af37; }
        .tier-badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .tier-free { background: #3b82f6; }
        .tier-pro { background: #8b5cf6; }
        .tier-elite { background: #d4af37; color: #0a0a0a; }
    </style>
</head>
<body class="text-white">
    <nav class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" class="flex items-center space-x-3">
                <i class="fas fa-chart-line text-2xl gold-text"></i>
                <span class="text-xl font-bold gold-gradient">Finspark 投资分析</span>
            </a>
            <div class="flex items-center space-x-6">
                <a href="/" class="text-gray-400 hover:text-white">首页</a>
                <a href="/my-reports" class="text-gray-400 hover:text-white">我的分析</a>
                <a href="/favorites" class="text-gray-400 hover:text-white">我的收藏</a>
                <a href="/account" class="gold-text font-medium">账号设置</a>
            </div>
        </div>
    </nav>

    <main class="pt-24 pb-16 px-4">
        <div class="max-w-3xl mx-auto">
            <h1 class="text-3xl font-bold gold-gradient mb-8"><i class="fas fa-cog mr-3"></i>账号设置</h1>
            
            <!-- 需要登录提示 -->
            <div id="needLogin" class="card rounded-xl p-8 text-center hidden">
                <i class="fas fa-lock text-5xl gold-text mb-4"></i>
                <h3 class="text-xl font-semibold mb-2">请先登录</h3>
                <p class="text-gray-400 mb-6">登录后即可管理您的账号设置</p>
                <a href="/" class="btn-gold px-8 py-3 rounded-lg inline-block">返回首页登录</a>
            </div>
            
            <!-- 账号信息 -->
            <div id="accountContent" class="space-y-6">
                <!-- 会员信息 -->
                <div class="card rounded-xl p-6">
                    <h2 class="text-lg font-semibold gold-text mb-4"><i class="fas fa-crown mr-2"></i>会员信息</h2>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-gray-300">当前等级：</span>
                                <span id="tierBadge" class="tier-badge tier-free">免费</span>
                            </div>
                            <div class="text-sm text-gray-500" id="tierExpires"></div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-400">今日剩余分析</div>
                            <div class="text-2xl font-bold gold-text" id="remainingQuota">--</div>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-700">
                        <div class="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div class="text-2xl font-bold gold-text" id="totalAnalyses">0</div>
                                <div class="text-xs text-gray-500">总分析数</div>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-purple-400" id="totalComics">0</div>
                                <div class="text-xs text-gray-500">漫画数</div>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-pink-400" id="totalFavorites">0</div>
                                <div class="text-xs text-gray-500">收藏数</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 基本信息 -->
                <div class="card rounded-xl p-6">
                    <h2 class="text-lg font-semibold gold-text mb-4"><i class="fas fa-user mr-2"></i>基本信息</h2>
                    <form id="profileForm" class="space-y-4">
                        <div>
                            <label class="block text-sm text-gray-400 mb-2">邮箱</label>
                            <input type="email" id="email" disabled class="input-field w-full px-4 py-3 rounded-lg opacity-60">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-400 mb-2">昵称</label>
                            <input type="text" id="nickname" class="input-field w-full px-4 py-3 rounded-lg" placeholder="设置昵称">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-400 mb-2">姓名</label>
                            <input type="text" id="name" class="input-field w-full px-4 py-3 rounded-lg" placeholder="真实姓名（可选）">
                        </div>
                        <button type="submit" class="btn-gold px-6 py-2 rounded-lg">保存修改</button>
                    </form>
                </div>
                
                <!-- 安全设置 -->
                <div class="card rounded-xl p-6">
                    <h2 class="text-lg font-semibold gold-text mb-4"><i class="fas fa-shield-alt mr-2"></i>安全设置</h2>
                    <div class="space-y-4">
                        <button onclick="showChangePassword()" class="btn-outline w-full py-3 rounded-lg text-left px-4">
                            <i class="fas fa-key mr-2"></i>修改密码
                        </button>
                        <button onclick="logoutAllDevices()" class="btn-outline w-full py-3 rounded-lg text-left px-4">
                            <i class="fas fa-sign-out-alt mr-2"></i>登出所有设备
                        </button>
                    </div>
                </div>
                
                <!-- 修改密码弹窗 -->
                <div id="passwordModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div class="card rounded-xl p-6 max-w-md w-full mx-4">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold gold-text">修改密码</h3>
                            <button onclick="hideChangePassword()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                        </div>
                        <form id="passwordForm" class="space-y-4">
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">当前密码</label>
                                <input type="password" name="oldPassword" required class="input-field w-full px-4 py-3 rounded-lg">
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-2">新密码</label>
                                <input type="password" name="newPassword" required minlength="6" class="input-field w-full px-4 py-3 rounded-lg">
                            </div>
                            <div id="passwordError" class="hidden text-red-400 text-sm"></div>
                            <button type="submit" class="btn-gold w-full py-3 rounded-lg">确认修改</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <script>
        async function loadAccountInfo() {
            const token = localStorage.getItem('accessToken');
            if (!token) {
                document.getElementById('needLogin').classList.remove('hidden');
                document.getElementById('accountContent').classList.add('hidden');
                return;
            }
            
            try {
                // 加载用户信息
                const userResponse = await fetch('/api/auth/me', {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const userData = await userResponse.json();
                
                if (!userData.success) {
                    document.getElementById('needLogin').classList.remove('hidden');
                    document.getElementById('accountContent').classList.add('hidden');
                    return;
                }
                
                const user = userData.user;
                const perms = userData.permissions;
                
                document.getElementById('email').value = user.email || '';
                document.getElementById('nickname').value = user.nickname || '';
                document.getElementById('name').value = user.name || '';
                
                // 会员等级
                const tier = user.membership_tier || 'free';
                const tierBadge = document.getElementById('tierBadge');
                const tierNames = { free: '免费', pro: 'Pro', elite: 'Elite' };
                tierBadge.textContent = tierNames[tier] || '免费';
                tierBadge.className = \`tier-badge tier-\${tier}\`;
                
                if (user.membership_expires_at) {
                    document.getElementById('tierExpires').textContent = \`到期时间：\${new Date(user.membership_expires_at).toLocaleDateString('zh-CN')}\`;
                }
                
                // 配额
                if (perms) {
                    document.getElementById('remainingQuota').textContent = 
                        perms.remainingAnalysis === null ? '无限' : perms.remainingAnalysis;
                }
                
                // 加载统计
                const statsResponse = await fetch('/api/user/stats', {
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                const statsData = await statsResponse.json();
                
                if (statsData.success) {
                    document.getElementById('totalAnalyses').textContent = statsData.stats.analyses || 0;
                    document.getElementById('totalComics').textContent = statsData.stats.comics || 0;
                    document.getElementById('totalFavorites').textContent = statsData.stats.favorites || 0;
                }
            } catch (error) {
                console.error('Load account error:', error);
            }
        }
        
        document.getElementById('profileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('accessToken');
            
            try {
                const response = await fetch('/api/auth/me', {
                    method: 'PUT',
                    headers: {
                        'Authorization': \`Bearer \${token}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        nickname: document.getElementById('nickname').value,
                        name: document.getElementById('name').value
                    })
                });
                const data = await response.json();
                
                if (data.success) {
                    alert('保存成功');
                } else {
                    alert(data.error || '保存失败');
                }
            } catch (error) {
                alert('保存失败: ' + error.message);
            }
        });
        
        function showChangePassword() {
            document.getElementById('passwordModal').classList.remove('hidden');
        }
        
        function hideChangePassword() {
            document.getElementById('passwordModal').classList.add('hidden');
            document.getElementById('passwordForm').reset();
            document.getElementById('passwordError').classList.add('hidden');
        }
        
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('accessToken');
            const errorEl = document.getElementById('passwordError');
            
            try {
                const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Authorization': \`Bearer \${token}\`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        oldPassword: e.target.oldPassword.value,
                        newPassword: e.target.newPassword.value
                    })
                });
                const data = await response.json();
                
                if (data.success) {
                    alert('密码修改成功，请重新登录');
                    localStorage.clear();
                    window.location.href = '/';
                } else {
                    errorEl.textContent = data.error || '修改失败';
                    errorEl.classList.remove('hidden');
                }
            } catch (error) {
                errorEl.textContent = '修改失败: ' + error.message;
                errorEl.classList.remove('hidden');
            }
        });
        
        async function logoutAllDevices() {
            if (!confirm('确定要登出所有设备吗？这将使所有设备的登录失效。')) return;
            
            const token = localStorage.getItem('accessToken');
            try {
                await fetch('/api/auth/logout-all', {
                    method: 'POST',
                    headers: { 'Authorization': \`Bearer \${token}\` }
                });
                alert('已登出所有设备，请重新登录');
                localStorage.clear();
                window.location.href = '/';
            } catch (error) {
                alert('操作失败: ' + error.message);
            }
        }
        
        loadAccountInfo();
    </script>
</body>
</html>
  `);
});

// ============ 模型对比测试页面 ============
app.get('/model-test', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>模型对比测试 - Finspark 投资分析</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
        body { font-family: 'Noto Sans SC', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); min-height: 100vh; }
        .gold-text { color: #d4af37; }
        .gold-gradient { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 50%, #d4af37 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 12px; }
        .card:hover { border-color: rgba(212, 175, 55, 0.4); }
        .btn-gold { background: linear-gradient(135deg, #d4af37 0%, #f5d17e 100%); color: #0a0a0a; font-weight: 600; transition: all 0.3s ease; }
        .btn-gold:hover { transform: scale(1.02); box-shadow: 0 5px 20px rgba(212, 175, 55, 0.4); }
        .btn-gold:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .model-card { transition: all 0.3s ease; }
        .model-card.winner { border-color: #10b981; box-shadow: 0 0 20px rgba(16, 185, 129, 0.3); }
        .model-card.gemini { border-left: 4px solid #4285f4; }
        .model-card.gpt { border-left: 4px solid #10a37f; }
        .select-field { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; }
        .select-field:focus { border-color: #d4af37; outline: none; }
        .select-field option { background: #1a1a2e; }
        .textarea-field { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: white; }
        .textarea-field:focus { border-color: #d4af37; outline: none; }
        .score-bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.1); overflow: hidden; }
        .score-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
        .json-viewer { background: rgba(0,0,0,0.3); border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 400px; overflow: auto; }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .tab { cursor: pointer; padding: 8px 16px; border-radius: 8px; }
        .tab:hover { background: rgba(255,255,255,0.05); }
        .tab.active { background: rgba(212, 175, 55, 0.2); color: #d4af37; }
    </style>
</head>
<body class="text-white">
    <!-- 导航栏 -->
    <nav class="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-gray-800">
        <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <i class="fas fa-chart-line text-2xl gold-text"></i>
                <span class="text-xl font-bold gold-gradient">Finspark 投资分析</span>
            </div>
            <div class="flex items-center space-x-6">
                <a href="/" class="text-gray-400 hover:text-white">首页</a>
                <a href="/model-test" class="gold-text">模型对比</a>
            </div>
        </div>
    </nav>

    <main class="pt-24 pb-16 px-4">
        <div class="max-w-7xl mx-auto">
            <div class="flex items-center justify-between mb-8">
                <h1 class="text-3xl font-bold gold-gradient">
                    <i class="fas fa-flask mr-3"></i>三模型并行对比测试
                </h1>
                <div class="text-sm text-gray-400">
                    对比 Gemini 2.5 Pro / GPT-4.1 / GPT-5 Nano
                </div>
            </div>

            <!-- 测试模式切换 -->
            <div class="flex gap-4 mb-6">
                <button id="singleTestTab" onclick="switchTestMode('single')" class="tab active px-6 py-3 rounded-lg border border-gray-700">
                    <i class="fas fa-vial mr-2"></i>单 Agent 测试
                </button>
                <button id="fullTestTab" onclick="switchTestMode('full')" class="tab px-6 py-3 rounded-lg border border-gray-700">
                    <i class="fas fa-layer-group mr-2"></i>全量 Agent 测试
                </button>
            </div>

            <!-- 单 Agent 测试配置 -->
            <div id="singleTestPanel" class="card p-6 mb-6">
                <h2 class="text-lg font-semibold mb-4"><i class="fas fa-cog mr-2 gold-text"></i>单 Agent 测试配置</h2>
                <div class="grid md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm text-gray-400 mb-2">选择分析 Agent</label>
                        <select id="agentSelect" class="select-field w-full px-4 py-3 rounded-lg">
                            <option value="PROFITABILITY">盈利能力分析 (PROFITABILITY)</option>
                            <option value="BALANCE_SHEET">资产负债分析 (BALANCE_SHEET)</option>
                            <option value="CASH_FLOW">现金流分析 (CASH_FLOW)</option>
                            <option value="EARNINGS_QUALITY">盈利质量分析 (EARNINGS_QUALITY)</option>
                            <option value="RISK">风险评估 (RISK)</option>
                            <option value="BUSINESS_INSIGHT">业务洞察 (BUSINESS_INSIGHT)</option>
                            <option value="PLANNING">分析规划 (PLANNING)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-400 mb-2">测试数据来源</label>
                        <select id="dataSource" class="select-field w-full px-4 py-3 rounded-lg">
                            <option value="sample">使用示例数据（贵州茅台）</option>
                            <option value="custom">自定义数据</option>
                        </select>
                    </div>
                </div>
                
                <!-- 自定义数据输入 -->
                <div id="customDataSection" class="mt-4 hidden">
                    <label class="block text-sm text-gray-400 mb-2">自定义测试数据 (JSON格式)</label>
                    <textarea id="customData" class="textarea-field w-full px-4 py-3 rounded-lg h-40" placeholder='{"companyName": "公司名称", "financialData": {...}}'></textarea>
                </div>
                
                <div class="mt-6 flex items-center gap-4">
                    <button id="runTestBtn" onclick="runTest()" class="btn-gold px-8 py-3 rounded-lg">
                        <i class="fas fa-play mr-2"></i>开始对比测试
                    </button>
                    <div id="testStatus" class="text-sm text-gray-400 hidden">
                        <i class="fas fa-spinner spinner mr-2"></i>
                        <span id="statusText">正在并行调用三个模型...</span>
                    </div>
                </div>
            </div>

            <!-- 全量 Agent 测试配置 -->
            <div id="fullTestPanel" class="card p-6 mb-6 hidden">
                <h2 class="text-lg font-semibold mb-4"><i class="fas fa-layer-group mr-2 gold-text"></i>全量 Agent 测试</h2>
                <p class="text-gray-400 mb-4">
                    对所有 7 个分析 Agent 进行三模型并行对比测试，生成综合评估报告。
                    <br><span class="text-yellow-500">注意：全量测试预计需要 3-5 分钟完成。</span>
                </p>
                <div class="bg-gray-800/50 rounded-lg p-4 mb-4">
                    <div class="text-sm text-gray-300 mb-2">将测试以下 Agent：</div>
                    <div class="flex flex-wrap gap-2">
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">分析规划</span>
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">盈利能力</span>
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">资产负债</span>
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">现金流</span>
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">盈利质量</span>
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">风险评估</span>
                        <span class="px-3 py-1 bg-blue-900/50 rounded text-sm">业务洞察</span>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <button id="runFullTestBtn" onclick="runFullTest()" class="btn-gold px-8 py-3 rounded-lg">
                        <i class="fas fa-rocket mr-2"></i>开始全量测试
                    </button>
                    <div id="fullTestStatus" class="text-sm text-gray-400 hidden">
                        <i class="fas fa-spinner spinner mr-2"></i>
                        <span id="fullStatusText">正在测试所有 Agent...</span>
                    </div>
                </div>
            </div>

            <!-- 全量测试结果 -->
            <div id="fullResultsSection" class="hidden">
                <!-- 综合评估概览 -->
                <div class="card p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-crown mr-2 gold-text"></i>综合评估概览</h2>
                    <div id="fullSummaryCards" class="grid md:grid-cols-3 gap-6 mb-6">
                        <!-- 三个模型的综合卡片 -->
                    </div>
                    <div id="overallWinnerBanner" class="p-4 bg-gradient-to-r from-yellow-900/30 to-yellow-700/30 border border-yellow-500/50 rounded-lg">
                        <!-- 综合获胜者 -->
                    </div>
                </div>

                <!-- 各维度获胜统计 -->
                <div class="card p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-medal mr-2 gold-text"></i>各维度获胜次数统计</h2>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div id="winsChart" style="height: 300px;"></div>
                        <div id="winsTable">
                            <!-- 获胜统计表格 -->
                        </div>
                    </div>
                </div>

                <!-- 各 Agent 详细得分 -->
                <div class="card p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-list-check mr-2 gold-text"></i>各 Agent 详细得分</h2>
                    <div class="overflow-x-auto">
                        <table id="agentScoresTable" class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-gray-700">
                                    <th class="text-left py-3 px-4">Agent</th>
                                    <th class="text-center py-3 px-4">Gemini 2.5 Pro</th>
                                    <th class="text-center py-3 px-4">GPT-4.1</th>
                                    <th class="text-center py-3 px-4">GPT-5 Nano</th>
                                    <th class="text-center py-3 px-4">获胜模型</th>
                                </tr>
                            </thead>
                            <tbody id="agentScoresBody">
                                <!-- 动态填充 -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 性能指标汇总 -->
                <div class="card p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-tachometer-alt mr-2 gold-text"></i>性能指标汇总</h2>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div id="fullRadarChart" style="height: 350px;"></div>
                        <div id="costLatencyChart" style="height: 350px;"></div>
                    </div>
                </div>
            </div>

            <!-- 单测试结果 -->
            <div id="resultsSection" class="hidden">
                <!-- 评估摘要 -->
                <div class="card p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-trophy mr-2 gold-text"></i>评估摘要</h2>
                    <div id="evaluationSummary" class="grid md:grid-cols-4 gap-4">
                        <!-- 动态填充 -->
                    </div>
                    <div id="recommendation" class="mt-4 p-4 bg-green-900/30 border border-green-500/30 rounded-lg hidden">
                        <i class="fas fa-lightbulb mr-2 text-green-400"></i>
                        <span id="recommendationText"></span>
                    </div>
                </div>

                <!-- 模型对比卡片 -->
                <div class="grid md:grid-cols-3 gap-6 mb-6" id="modelCards">
                    <!-- 动态填充 -->
                </div>

                <!-- 详细指标对比 -->
                <div class="card p-6 mb-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-chart-bar mr-2 gold-text"></i>详细指标对比</h2>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div id="radarChart" style="height: 350px;"></div>
                        <div id="barChart" style="height: 350px;"></div>
                    </div>
                </div>

                <!-- 输出内容对比 -->
                <div class="card p-6">
                    <h2 class="text-lg font-semibold mb-4"><i class="fas fa-code mr-2 gold-text"></i>输出内容对比</h2>
                    <div class="flex gap-2 mb-4" id="outputTabs">
                        <!-- 动态填充 -->
                    </div>
                    <div id="outputContent" class="json-viewer p-4">
                        <!-- 动态填充 -->
                    </div>
                </div>
            </div>

            <!-- 历史统计 -->
            <div class="card p-6 mt-6">
                <h2 class="text-lg font-semibold mb-4"><i class="fas fa-history mr-2 gold-text"></i>历史统计</h2>
                <div id="statisticsSection">
                    <p class="text-gray-400">完成测试后将显示历史统计数据</p>
                </div>
            </div>
        </div>
    </main>

    <script>
        // 显示/隐藏自定义数据输入
        document.getElementById('dataSource').addEventListener('change', function() {
            const customSection = document.getElementById('customDataSection');
            customSection.classList.toggle('hidden', this.value !== 'custom');
        });

        // 当前测试结果
        let currentResults = null;
        let currentOutputTab = null;

        // 运行测试
        async function runTest() {
            const btn = document.getElementById('runTestBtn');
            const status = document.getElementById('testStatus');
            const results = document.getElementById('resultsSection');
            
            btn.disabled = true;
            status.classList.remove('hidden');
            results.classList.add('hidden');
            
            const agentType = document.getElementById('agentSelect').value;
            const dataSource = document.getElementById('dataSource').value;
            
            let endpoint = '/api/model-test/quick-test';
            let body = { agentType };
            
            if (dataSource === 'custom') {
                const customData = document.getElementById('customData').value;
                try {
                    body.testData = JSON.parse(customData);
                    endpoint = '/api/model-test/compare';
                } catch (e) {
                    alert('自定义数据JSON格式错误');
                    btn.disabled = false;
                    status.classList.add('hidden');
                    return;
                }
            }
            
            try {
                const token = localStorage.getItem('accessToken');
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? \`Bearer \${token}\` : ''
                    },
                    body: JSON.stringify(body)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    currentResults = data.result;
                    displayResults(data.result);
                    results.classList.remove('hidden');
                } else {
                    alert('测试失败: ' + (data.error || '未知错误'));
                }
            } catch (error) {
                alert('请求失败: ' + error.message);
            } finally {
                btn.disabled = false;
                status.classList.add('hidden');
            }
        }

        // 显示结果
        function displayResults(result) {
            displayEvaluationSummary(result.evaluation);
            displayModelCards(result.results, result.evaluation);
            displayCharts(result.results, result.evaluation);
            displayOutputTabs(result.results);
        }

        // 显示评估摘要
        function displayEvaluationSummary(evaluation) {
            const container = document.getElementById('evaluationSummary');
            if (!evaluation) {
                container.innerHTML = '<p class="text-gray-400 col-span-4">无评估数据</p>';
                return;
            }
            
            const modelNames = {
                'gemini-2.5-pro': 'Gemini 2.5 Pro',
                'gpt-4.1': 'GPT-4.1',
                'gpt-5-nano': 'GPT-5 Nano'
            };
            
            container.innerHTML = \`
                <div class="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
                    <div class="text-sm text-blue-400 mb-1">速度最快</div>
                    <div class="text-lg font-semibold">\${modelNames[evaluation.speedWinner] || evaluation.speedWinner}</div>
                </div>
                <div class="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4">
                    <div class="text-sm text-purple-400 mb-1">质量最优</div>
                    <div class="text-lg font-semibold">\${modelNames[evaluation.qualityWinner] || evaluation.qualityWinner}</div>
                </div>
                <div class="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
                    <div class="text-sm text-green-400 mb-1">成本最低</div>
                    <div class="text-lg font-semibold">\${modelNames[evaluation.costWinner] || evaluation.costWinner}</div>
                </div>
                <div class="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-4">
                    <div class="text-sm text-yellow-400 mb-1">综合推荐</div>
                    <div class="text-lg font-semibold gold-text">\${modelNames[evaluation.overallWinner] || evaluation.overallWinner}</div>
                </div>
            \`;
            
            if (evaluation.recommendation) {
                const recDiv = document.getElementById('recommendation');
                document.getElementById('recommendationText').textContent = evaluation.recommendation;
                recDiv.classList.remove('hidden');
            }
        }

        // 显示模型卡片
        function displayModelCards(results, evaluation) {
            const container = document.getElementById('modelCards');
            const modelColors = {
                'gemini-2.5-pro': { class: 'gemini', color: '#4285f4' },
                'gpt-4.1': { class: 'gpt', color: '#10a37f' },
                'gpt-5-nano': { class: 'gpt', color: '#10a37f' }
            };
            
            container.innerHTML = results.map(r => {
                const isWinner = evaluation?.overallWinner === r.modelId;
                const mc = modelColors[r.modelId] || { class: '', color: '#888' };
                const m = r.metrics;
                const score = evaluation?.scores?.[r.modelId];
                
                return \`
                    <div class="card model-card \${mc.class} \${isWinner ? 'winner' : ''} p-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-semibold">\${r.modelName}</h3>
                            \${isWinner ? '<span class="bg-green-500 text-white text-xs px-2 py-1 rounded">推荐</span>' : ''}
                        </div>
                        
                        <!-- 性能指标 -->
                        <div class="mb-3">
                            <div class="text-xs text-gray-500 mb-2 uppercase">性能指标</div>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-400">状态</span>
                                    <span class="\${r.success ? 'text-green-400' : 'text-red-400'}">\${r.success ? '成功' : '失败'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">延迟</span>
                                    <span>\${(m.latencyMs / 1000).toFixed(2)}s</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">Token数</span>
                                    <span>\${m.inputTokens || 0} / \${m.outputTokens || 0}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">成本</span>
                                    <span>$\${(m.costUsd || 0).toFixed(4)}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 质量指标 -->
                        <div class="mb-3 pt-3 border-t border-gray-700/50">
                            <div class="text-xs text-gray-500 mb-2 uppercase">质量指标</div>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-400">JSON有效</span>
                                    <span class="\${m.jsonValid ? 'text-green-400' : 'text-red-400'}">\${m.jsonValid ? '是' : '否'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">字段完整率</span>
                                    <span>\${(m.fieldsCompleteRate || 0).toFixed(0)}%</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">数据准确率</span>
                                    <span>\${(m.dataAccuracy || 0).toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 内容指标 -->
                        <div class="mb-3 pt-3 border-t border-gray-700/50">
                            <div class="text-xs text-gray-500 mb-2 uppercase">内容指标</div>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-400">响应长度</span>
                                    <span>\${(m.responseLength || 0).toLocaleString()} 字符</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">洞察数量</span>
                                    <span class="text-blue-400">\${m.insightCount || 0}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">风险识别</span>
                                    <span class="text-orange-400">\${m.riskIdentified || 0}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">建议数量</span>
                                    <span class="text-green-400">\${m.recommendationCount || 0}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-400">关键指标</span>
                                    <span class="text-purple-400">\${m.keyMetricsCount || 0}</span>
                                </div>
                            </div>
                        </div>
                        
                        \${score ? \`
                        <div class="pt-3 border-t border-gray-700">
                            <div class="text-sm text-gray-400 mb-2">综合评分</div>
                            <div class="text-3xl font-bold" style="color: \${mc.color}">\${score.overall}</div>
                            <div class="mt-3 space-y-2">
                                <div>
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>速度</span><span>\${score.speed}</span>
                                    </div>
                                    <div class="score-bar"><div class="score-fill bg-blue-500" style="width: \${score.speed}%"></div></div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>质量</span><span>\${score.quality}</span>
                                    </div>
                                    <div class="score-bar"><div class="score-fill bg-purple-500" style="width: \${score.quality}%"></div></div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>成本</span><span>\${score.cost}</span>
                                    </div>
                                    <div class="score-bar"><div class="score-fill bg-green-500" style="width: \${score.cost}%"></div></div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>内容丰富度</span><span>\${score.content || 0}</span>
                                    </div>
                                    <div class="score-bar"><div class="score-fill bg-yellow-500" style="width: \${score.content || 0}%"></div></div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-xs text-gray-400 mb-1">
                                        <span>数据准确率</span><span>\${score.accuracy || 0}</span>
                                    </div>
                                    <div class="score-bar"><div class="score-fill bg-cyan-500" style="width: \${score.accuracy || 0}%"></div></div>
                                </div>
                            </div>
                        </div>
                        \` : ''}
                        
                        \${r.error ? \`<div class="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded text-sm text-red-400">\${r.error}</div>\` : ''}
                    </div>
                \`;
            }).join('');
        }

        // 显示图表
        function displayCharts(results, evaluation) {
            if (!evaluation?.scores) return;
            
            // 雷达图 - 六维度对比
            const radarChart = echarts.init(document.getElementById('radarChart'));
            const radarOption = {
                backgroundColor: 'transparent',
                title: { text: '六维度综合对比', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
                legend: { bottom: 10, textStyle: { color: '#9ca3af' } },
                radar: {
                    indicator: [
                        { name: '速度', max: 100 },
                        { name: '质量', max: 100 },
                        { name: '成本', max: 100 },
                        { name: '完整度', max: 100 },
                        { name: '内容丰富度', max: 100 },
                        { name: '数据准确率', max: 100 }
                    ],
                    axisLine: { lineStyle: { color: 'rgba(212, 175, 55, 0.3)' } },
                    splitLine: { lineStyle: { color: 'rgba(212, 175, 55, 0.2)' } }
                },
                series: [{
                    type: 'radar',
                    data: results.filter(r => evaluation.scores[r.modelId]).map(r => {
                        const s = evaluation.scores[r.modelId];
                        return {
                            value: [s.speed, s.quality, s.cost, s.completeness, s.content || 0, s.accuracy || 0],
                            name: r.modelName,
                            areaStyle: { opacity: 0.2 }
                        };
                    })
                }]
            };
            radarChart.setOption(radarOption);
            
            // 柱状图 - 内容指标对比
            const barChart = echarts.init(document.getElementById('barChart'));
            const barOption = {
                backgroundColor: 'transparent',
                title: { text: '内容指标对比', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
                tooltip: { trigger: 'axis' },
                legend: { bottom: 10, textStyle: { color: '#9ca3af' } },
                xAxis: {
                    type: 'category',
                    data: ['洞察数量', '风险识别', '建议数量', '关键指标'],
                    axisLabel: { color: '#9ca3af' }
                },
                yAxis: { type: 'value', axisLabel: { color: '#9ca3af' } },
                series: results.map(r => ({
                    name: r.modelName,
                    type: 'bar',
                    data: [
                        r.metrics.insightCount || 0,
                        r.metrics.riskIdentified || 0,
                        r.metrics.recommendationCount || 0,
                        r.metrics.keyMetricsCount || 0
                    ]
                }))
            };
            barChart.setOption(barOption);
        }

        // 显示输出Tab
        function displayOutputTabs(results) {
            const tabContainer = document.getElementById('outputTabs');
            tabContainer.innerHTML = results.map((r, i) => \`
                <div class="tab \${i === 0 ? 'active' : ''}" onclick="switchOutputTab('\${r.modelId}', this)">
                    \${r.modelName}
                </div>
            \`).join('');
            
            if (results.length > 0) {
                currentOutputTab = results[0].modelId;
                displayOutputContent(results[0]);
            }
        }

        // 切换输出Tab
        function switchOutputTab(modelId, tabEl) {
            document.querySelectorAll('#outputTabs .tab').forEach(t => t.classList.remove('active'));
            tabEl.classList.add('active');
            
            const result = currentResults?.results?.find(r => r.modelId === modelId);
            if (result) {
                displayOutputContent(result);
            }
        }

        // 显示输出内容
        function displayOutputContent(result) {
            const container = document.getElementById('outputContent');
            if (result.parsedJson) {
                container.innerHTML = '<pre>' + JSON.stringify(result.parsedJson, null, 2) + '</pre>';
            } else if (result.content) {
                container.innerHTML = '<pre>' + escapeHtml(result.content) + '</pre>';
            } else {
                container.innerHTML = '<p class="text-gray-400">无输出内容</p>';
            }
        }

        // HTML转义
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 加载统计数据
        async function loadStatistics() {
            try {
                const token = localStorage.getItem('accessToken');
                const response = await fetch('/api/model-test/statistics', {
                    headers: { 'Authorization': token ? \`Bearer \${token}\` : '' }
                });
                const data = await response.json();
                
                if (data.success && data.statistics?.length > 0) {
                    displayStatistics(data.statistics);
                }
            } catch (error) {
                console.error('加载统计失败:', error);
            }
        }

        // 显示统计
        function displayStatistics(stats) {
            const container = document.getElementById('statisticsSection');
            
            // 按模型分组
            const byModel = {};
            stats.forEach(s => {
                if (!byModel[s.model_name]) byModel[s.model_name] = [];
                byModel[s.model_name].push(s);
            });
            
            container.innerHTML = \`
                <div class="grid md:grid-cols-3 gap-4">
                    \${Object.entries(byModel).map(([model, data]) => {
                        const avgLatency = data.reduce((a, d) => a + d.avg_latency_ms, 0) / data.length;
                        const avgCost = data.reduce((a, d) => a + d.avg_cost_usd, 0) / data.length;
                        const avgScore = data.reduce((a, d) => a + d.avg_auto_score, 0) / data.length;
                        const totalCalls = data.reduce((a, d) => a + d.total_calls, 0);
                        
                        return \`
                            <div class="bg-gray-800/50 rounded-lg p-4">
                                <h4 class="font-semibold mb-2">\${model}</h4>
                                <div class="text-sm space-y-1 text-gray-400">
                                    <div>总调用: \${totalCalls}次</div>
                                    <div>平均延迟: \${(avgLatency/1000).toFixed(2)}s</div>
                                    <div>平均成本: $\${avgCost.toFixed(4)}</div>
                                    <div>平均得分: \${avgScore.toFixed(0)}</div>
                                </div>
                            </div>
                        \`;
                    }).join('')}
                </div>
            \`;
        }

        // 页面加载时尝试加载统计
        loadStatistics();

        // ============ 测试模式切换 ============
        function switchTestMode(mode) {
            const singleTab = document.getElementById('singleTestTab');
            const fullTab = document.getElementById('fullTestTab');
            const singlePanel = document.getElementById('singleTestPanel');
            const fullPanel = document.getElementById('fullTestPanel');
            const resultsSection = document.getElementById('resultsSection');
            const fullResultsSection = document.getElementById('fullResultsSection');
            
            if (mode === 'single') {
                singleTab.classList.add('active');
                fullTab.classList.remove('active');
                singlePanel.classList.remove('hidden');
                fullPanel.classList.add('hidden');
                fullResultsSection.classList.add('hidden');
            } else {
                singleTab.classList.remove('active');
                fullTab.classList.add('active');
                singlePanel.classList.add('hidden');
                fullPanel.classList.remove('hidden');
                resultsSection.classList.add('hidden');
            }
        }

        // ============ 全量测试 ============
        let fullTestResults = null;

        async function runFullTest() {
            const btn = document.getElementById('runFullTestBtn');
            const status = document.getElementById('fullTestStatus');
            const statusText = document.getElementById('fullStatusText');
            const resultsSection = document.getElementById('fullResultsSection');
            
            btn.disabled = true;
            status.classList.remove('hidden');
            resultsSection.classList.add('hidden');
            
            // Agent 列表
            const agentList = [
                { id: 'PLANNING', name: '分析规划' },
                { id: 'PROFITABILITY', name: '盈利能力' },
                { id: 'BALANCE_SHEET', name: '资产负债' },
                { id: 'CASH_FLOW', name: '现金流' },
                { id: 'EARNINGS_QUALITY', name: '盈利质量' },
                { id: 'RISK', name: '风险评估' },
                { id: 'BUSINESS_INSIGHT', name: '业务洞察' }
            ];
            
            const agentResults = {};
            const models = ['gemini-2.5-pro', 'gpt-4.1', 'gpt-5-nano'];
            const startTime = Date.now();
            
            try {
                // 逐个调用每个 Agent，避免整体超时
                for (let i = 0; i < agentList.length; i++) {
                    const agent = agentList[i];
                    statusText.textContent = '正在测试: ' + agent.name + '... (' + (i + 1) + '/' + agentList.length + ')';
                    
                    try {
                        const response = await fetch('/api/model-test/test-agent', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ agentType: agent.id })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            agentResults[agent.id] = data.result;
                        }
                    } catch (agentError) {
                        console.error('Agent ' + agent.id + ' 测试失败:', agentError);
                    }
                }
                
                const totalTime = Date.now() - startTime;
                
                // 汇总统计
                const modelSummary = {};
                models.forEach(modelId => {
                    modelSummary[modelId] = {
                        totalLatency: 0, totalCost: 0, totalScore: 0, successCount: 0,
                        avgFieldsComplete: 0, avgInsightCount: 0, avgRiskCount: 0,
                        wins: { speed: 0, quality: 0, cost: 0, overall: 0 },
                        agentScores: {}
                    };
                });
                
                // 汇总各 Agent 结果
                Object.entries(agentResults).forEach(([agentType, result]) => {
                    if (!result.evaluation) return;
                    
                    // 统计获胜次数
                    if (result.evaluation.speedWinner) modelSummary[result.evaluation.speedWinner].wins.speed++;
                    if (result.evaluation.qualityWinner) modelSummary[result.evaluation.qualityWinner].wins.quality++;
                    if (result.evaluation.costWinner) modelSummary[result.evaluation.costWinner].wins.cost++;
                    if (result.evaluation.overallWinner) modelSummary[result.evaluation.overallWinner].wins.overall++;
                    
                    // 汇总各模型的指标
                    result.results.forEach(modelResult => {
                        const modelId = modelResult.modelId;
                        const metrics = modelResult.metrics;
                        const score = result.evaluation.scores?.[modelId];
                        
                        if (modelResult.success) {
                            modelSummary[modelId].successCount++;
                            modelSummary[modelId].totalLatency += metrics.latencyMs;
                            modelSummary[modelId].totalCost += metrics.costUsd;
                            modelSummary[modelId].avgFieldsComplete += metrics.fieldsCompleteRate;
                            modelSummary[modelId].avgInsightCount += metrics.insightCount || 0;
                            modelSummary[modelId].avgRiskCount += metrics.riskIdentified || 0;
                            
                            if (score) {
                                modelSummary[modelId].totalScore += score.overall;
                                modelSummary[modelId].agentScores[agentType] = score.overall;
                            }
                        }
                    });
                });
                
                // 计算平均值
                const agentCount = Object.keys(agentResults).length;
                models.forEach(modelId => {
                    const summary = modelSummary[modelId];
                    if (summary.successCount > 0) {
                        summary.avgFieldsComplete = Math.round(summary.avgFieldsComplete / summary.successCount);
                        summary.avgInsightCount = Math.round(summary.avgInsightCount / summary.successCount * 10) / 10;
                        summary.avgRiskCount = Math.round(summary.avgRiskCount / summary.successCount * 10) / 10;
                    }
                });
                
                // 确定综合获胜者
                let overallWinner = models[0];
                let maxWins = 0;
                models.forEach(modelId => {
                    if (modelSummary[modelId].wins.overall > maxWins) {
                        maxWins = modelSummary[modelId].wins.overall;
                        overallWinner = modelId;
                    }
                });
                
                // 构造结果数据
                fullTestResults = {
                    success: true,
                    summary: {
                        totalAgents: agentCount,
                        totalTime,
                        models: modelSummary,
                        overallWinner,
                        testData: { company: '贵州茅台', period: '2023年报' }
                    },
                    agentResults
                };
                
                displayFullResults(fullTestResults);
                resultsSection.classList.remove('hidden');
                
            } catch (error) {
                alert('全量测试失败: ' + error.message);
            } finally {
                btn.disabled = false;
                status.classList.add('hidden');
            }
        }

        // 显示全量测试结果
        function displayFullResults(data) {
            const summary = data.summary;
            const models = summary.models;
            
            const modelNames = {
                'gemini-2.5-pro': 'Gemini 2.5 Pro',
                'gpt-4.1': 'GPT-4.1',
                'gpt-5-nano': 'GPT-5 Nano'
            };
            
            const modelColors = {
                'gemini-2.5-pro': { bg: 'from-blue-900/50 to-blue-800/30', border: 'border-blue-500/50', text: 'text-blue-400' },
                'gpt-4.1': { bg: 'from-green-900/50 to-green-800/30', border: 'border-green-500/50', text: 'text-green-400' },
                'gpt-5-nano': { bg: 'from-purple-900/50 to-purple-800/30', border: 'border-purple-500/50', text: 'text-purple-400' }
            };

            // 显示三个模型的综合卡片
            const cardsContainer = document.getElementById('fullSummaryCards');
            cardsContainer.innerHTML = Object.entries(models).map(([modelId, m]) => {
                const isWinner = modelId === summary.overallWinner;
                const mc = modelColors[modelId] || { bg: 'from-gray-900/50 to-gray-800/30', border: 'border-gray-500/50', text: 'text-gray-400' };
                const avgScore = m.successCount > 0 ? (m.totalScore / m.successCount).toFixed(1) : 'N/A';
                
                return \`
                    <div class="bg-gradient-to-br \${mc.bg} border \${mc.border} rounded-xl p-6 \${isWinner ? 'ring-2 ring-yellow-500' : ''}">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-bold \${mc.text}">\${modelNames[modelId] || modelId}</h3>
                            \${isWinner ? '<span class="bg-yellow-500 text-black text-xs px-2 py-1 rounded font-bold">🏆 综合最佳</span>' : ''}
                        </div>
                        
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-gray-400">成功率</span>
                                <span class="font-semibold">\${m.successCount}/\${summary.totalAgents}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">平均得分</span>
                                <span class="font-semibold">\${avgScore}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">总延迟</span>
                                <span class="font-semibold">\${(m.totalLatency / 1000).toFixed(1)}s</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">总成本</span>
                                <span class="font-semibold">$\${m.totalCost.toFixed(4)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">平均字段完整率</span>
                                <span class="font-semibold">\${m.avgFieldsComplete}%</span>
                            </div>
                        </div>
                        
                        <div class="mt-4 pt-4 border-t border-gray-700">
                            <div class="text-sm text-gray-400 mb-2">获胜次数</div>
                            <div class="grid grid-cols-4 gap-2 text-center text-sm">
                                <div>
                                    <div class="text-blue-400 font-bold">\${m.wins.speed}</div>
                                    <div class="text-xs text-gray-500">速度</div>
                                </div>
                                <div>
                                    <div class="text-purple-400 font-bold">\${m.wins.quality}</div>
                                    <div class="text-xs text-gray-500">质量</div>
                                </div>
                                <div>
                                    <div class="text-green-400 font-bold">\${m.wins.cost}</div>
                                    <div class="text-xs text-gray-500">成本</div>
                                </div>
                                <div>
                                    <div class="text-yellow-400 font-bold">\${m.wins.overall}</div>
                                    <div class="text-xs text-gray-500">综合</div>
                                </div>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');

            // 综合获胜者横幅
            const winnerBanner = document.getElementById('overallWinnerBanner');
            winnerBanner.innerHTML = \`
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-lg font-bold gold-text">
                            <i class="fas fa-crown mr-2"></i>综合评估结果
                        </div>
                        <div class="text-sm text-gray-300 mt-1">
                            基于 \${summary.totalAgents} 个 Agent 的 \${summary.totalAgents * 3} 次模型调用
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm text-gray-400">推荐使用</div>
                        <div class="text-2xl font-bold text-white">\${modelNames[summary.overallWinner] || summary.overallWinner}</div>
                    </div>
                </div>
                <div class="mt-3 text-sm text-gray-400">
                    总耗时: \${(summary.totalTime / 1000).toFixed(1)} 秒 | 
                    测试数据: \${summary.testData.company} \${summary.testData.period}
                </div>
            \`;

            // 显示获胜次数图表
            displayWinsChart(models, modelNames);
            displayWinsTable(models, modelNames, summary.overallWinner);
            
            // 显示各 Agent 详细得分表格
            displayAgentScoresTable(data.agentResults, modelNames);
            
            // 显示汇总图表
            displayFullCharts(models, modelNames);
        }

        // 获胜次数柱状图
        function displayWinsChart(models, modelNames) {
            const chart = echarts.init(document.getElementById('winsChart'));
            
            const modelIds = Object.keys(models);
            const categories = ['速度', '质量', '成本', '综合'];
            
            const series = modelIds.map(modelId => ({
                name: modelNames[modelId] || modelId,
                type: 'bar',
                data: [
                    models[modelId].wins.speed,
                    models[modelId].wins.quality,
                    models[modelId].wins.cost,
                    models[modelId].wins.overall
                ]
            }));
            
            chart.setOption({
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { data: modelIds.map(id => modelNames[id] || id), textStyle: { color: '#9ca3af' }, bottom: 0 },
                grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                xAxis: { type: 'category', data: categories, axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } } },
                yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#374151' } } },
                series: series,
                color: ['#4285f4', '#10a37f', '#a855f7'],
                backgroundColor: 'transparent'
            });
        }

        // 获胜次数表格
        function displayWinsTable(models, modelNames, overallWinner) {
            const container = document.getElementById('winsTable');
            const modelIds = Object.keys(models);
            
            container.innerHTML = \`
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b border-gray-700">
                            <th class="text-left py-2 px-3">模型</th>
                            <th class="text-center py-2 px-3">速度</th>
                            <th class="text-center py-2 px-3">质量</th>
                            <th class="text-center py-2 px-3">成本</th>
                            <th class="text-center py-2 px-3">综合</th>
                            <th class="text-center py-2 px-3">总计</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${modelIds.map(modelId => {
                            const m = models[modelId];
                            const total = m.wins.speed + m.wins.quality + m.wins.cost + m.wins.overall;
                            const isWinner = modelId === overallWinner;
                            return \`
                                <tr class="border-b border-gray-800 \${isWinner ? 'bg-yellow-900/20' : ''}">
                                    <td class="py-3 px-3 font-medium \${isWinner ? 'text-yellow-400' : ''}">\${modelNames[modelId] || modelId}</td>
                                    <td class="text-center py-3 px-3">\${m.wins.speed}</td>
                                    <td class="text-center py-3 px-3">\${m.wins.quality}</td>
                                    <td class="text-center py-3 px-3">\${m.wins.cost}</td>
                                    <td class="text-center py-3 px-3">\${m.wins.overall}</td>
                                    <td class="text-center py-3 px-3 font-bold">\${total}</td>
                                </tr>
                            \`;
                        }).join('')}
                    </tbody>
                </table>
            \`;
        }

        // 各 Agent 详细得分表格
        function displayAgentScoresTable(agentResults, modelNames) {
            const tbody = document.getElementById('agentScoresBody');
            const agentNameMap = {
                'PLANNING': '分析规划',
                'PROFITABILITY': '盈利能力',
                'BALANCE_SHEET': '资产负债',
                'CASH_FLOW': '现金流',
                'EARNINGS_QUALITY': '盈利质量',
                'RISK': '风险评估',
                'BUSINESS_INSIGHT': '业务洞察'
            };
            
            const modelIds = ['gemini-2.5-pro', 'gpt-4.1', 'gpt-5-nano'];
            
            tbody.innerHTML = Object.entries(agentResults).map(([agentType, result]) => {
                const evaluation = result.evaluation;
                const scores = evaluation?.scores || {};
                const winner = evaluation?.overallWinner;
                
                return \`
                    <tr class="border-b border-gray-800 hover:bg-gray-800/30">
                        <td class="py-3 px-4 font-medium">\${agentNameMap[agentType] || agentType}</td>
                        \${modelIds.map(modelId => {
                            const score = scores[modelId]?.overall;
                            const isWinner = modelId === winner;
                            return \`
                                <td class="text-center py-3 px-4 \${isWinner ? 'text-yellow-400 font-bold' : ''}">
                                    \${score !== undefined ? score.toFixed(1) : '-'}
                                    \${isWinner ? ' 🏆' : ''}
                                </td>
                            \`;
                        }).join('')}
                        <td class="text-center py-3 px-4">
                            <span class="px-2 py-1 rounded text-xs \${
                                winner === 'gemini-2.5-pro' ? 'bg-blue-900/50 text-blue-400' :
                                winner === 'gpt-4.1' ? 'bg-green-900/50 text-green-400' :
                                'bg-purple-900/50 text-purple-400'
                            }">
                                \${modelNames[winner] || winner || '-'}
                            </span>
                        </td>
                    </tr>
                \`;
            }).join('');
        }

        // 汇总图表
        function displayFullCharts(models, modelNames) {
            const modelIds = Object.keys(models);
            
            // 雷达图 - 各维度平均表现
            const radarChart = echarts.init(document.getElementById('fullRadarChart'));
            radarChart.setOption({
                title: { text: '综合能力对比', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
                tooltip: {},
                legend: { data: modelIds.map(id => modelNames[id] || id), bottom: 0, textStyle: { color: '#9ca3af' } },
                radar: {
                    indicator: [
                        { name: '成功率', max: 100 },
                        { name: '平均得分', max: 100 },
                        { name: '字段完整率', max: 100 },
                        { name: '速度胜率', max: 100 },
                        { name: '质量胜率', max: 100 },
                        { name: '成本胜率', max: 100 }
                    ],
                    axisName: { color: '#9ca3af' },
                    splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)'] } }
                },
                series: [{
                    type: 'radar',
                    data: modelIds.map(modelId => {
                        const m = models[modelId];
                        const totalAgents = 7;
                        return {
                            name: modelNames[modelId] || modelId,
                            value: [
                                (m.successCount / totalAgents) * 100,
                                m.successCount > 0 ? (m.totalScore / m.successCount) : 0,
                                m.avgFieldsComplete,
                                (m.wins.speed / totalAgents) * 100,
                                (m.wins.quality / totalAgents) * 100,
                                (m.wins.cost / totalAgents) * 100
                            ]
                        };
                    })
                }],
                color: ['#4285f4', '#10a37f', '#a855f7'],
                backgroundColor: 'transparent'
            });

            // 成本-延迟散点图
            const scatterChart = echarts.init(document.getElementById('costLatencyChart'));
            scatterChart.setOption({
                title: { text: '成本 vs 延迟', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
                tooltip: {
                    trigger: 'item',
                    formatter: function(params) {
                        return params.seriesName + '<br/>延迟: ' + params.value[0].toFixed(1) + 's<br/>成本: $' + params.value[1].toFixed(4);
                    }
                },
                legend: { data: modelIds.map(id => modelNames[id] || id), bottom: 0, textStyle: { color: '#9ca3af' } },
                xAxis: {
                    name: '总延迟 (秒)',
                    nameTextStyle: { color: '#9ca3af' },
                    type: 'value',
                    axisLabel: { color: '#9ca3af' },
                    axisLine: { lineStyle: { color: '#374151' } },
                    splitLine: { lineStyle: { color: '#374151' } }
                },
                yAxis: {
                    name: '总成本 ($)',
                    nameTextStyle: { color: '#9ca3af' },
                    type: 'value',
                    axisLabel: { color: '#9ca3af', formatter: function(v) { return '$' + v.toFixed(4); } },
                    axisLine: { lineStyle: { color: '#374151' } },
                    splitLine: { lineStyle: { color: '#374151' } }
                },
                series: modelIds.map((modelId, idx) => ({
                    name: modelNames[modelId] || modelId,
                    type: 'scatter',
                    symbolSize: 30,
                    data: [[models[modelId].totalLatency / 1000, models[modelId].totalCost]]
                })),
                color: ['#4285f4', '#10a37f', '#a855f7'],
                backgroundColor: 'transparent'
            });
        }
    </script>
</body>
</html>
  `);
});

export default app;
// Force rebuild at Fri Jan  9 05:46:50 UTC 2026
