// 分析报告持久化服务 - D1 数据库

import type { AnalysisReport, AnalysisProgress } from '../types';

export interface ReportRecord {
  id: number;
  user_id: number | null;
  company_code: string;
  company_name: string;
  report_type: string;
  report_period: string | null;
  status: string;
  result_json: string | null;
  comic_status: string | null;
  comic_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ReportListItem {
  id: number;
  company_code: string;
  company_name: string;
  report_type: string;
  report_period?: string;
  status: string;
  created_at: string;
  score?: number;
  recommendation?: string;
}

export class ReportsService {
  private db: D1Database;
  private cache: KVNamespace;
  
  constructor(db: D1Database, cache: KVNamespace) {
    this.db = db;
    this.cache = cache;
  }
  
  /**
   * 创建新的分析报告
   */
  async createReport(
    companyCode: string,
    companyName: string,
    reportType: string,
    userId?: number,
    reportPeriod?: string
  ): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO analysis_reports (user_id, company_code, company_name, report_type, report_period, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).bind(userId || null, companyCode, companyName, reportType, reportPeriod || null).run();
    
    const reportId = result.meta.last_row_id as number;
    
    // 初始化进度到 KV
    await this.updateProgress(reportId, {
      currentPhase: '初始化',
      completedAgents: [],
      totalAgents: 10,
      percentage: 0,
    });
    
    return reportId;
  }
  
  /**
   * 更新报告状态
   */
  async updateStatus(reportId: number, status: string): Promise<void> {
    await this.db.prepare(
      'UPDATE analysis_reports SET status = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(status, reportId).run();
  }
  
  /**
   * 更新分析进度（存储到 KV）
   */
  async updateProgress(reportId: number, progress: AnalysisProgress): Promise<void> {
    await this.cache.put(
      `report:progress:${reportId}`,
      JSON.stringify(progress),
      { expirationTtl: 3600 } // 1小时过期
    );
  }
  
  /**
   * 获取分析进度
   */
  async getProgress(reportId: number): Promise<AnalysisProgress | null> {
    const data = await this.cache.get(`report:progress:${reportId}`, 'json');
    return data as AnalysisProgress | null;
  }
  
  /**
   * 保存分析结果
   */
  async saveResult(reportId: number, result: Partial<AnalysisReport>): Promise<void> {
    const resultJson = JSON.stringify(result);
    
    await this.db.prepare(`
      UPDATE analysis_reports 
      SET result_json = ?, status = 'completed', updated_at = datetime("now")
      WHERE id = ?
    `).bind(resultJson, reportId).run();
    
    // 同时更新 KV 缓存
    await this.cache.put(
      `report:result:${reportId}`,
      resultJson,
      { expirationTtl: 86400 } // 24小时缓存
    );
  }
  
  /**
   * 标记分析失败
   */
  async markFailed(reportId: number, error: string): Promise<void> {
    await this.db.prepare(`
      UPDATE analysis_reports 
      SET status = 'failed', result_json = ?, updated_at = datetime("now")
      WHERE id = ?
    `).bind(JSON.stringify({ error }), reportId).run();
  }
  
  /**
   * 获取报告详情
   */
  async getReport(reportId: number): Promise<ReportRecord | null> {
    return await this.db.prepare(
      'SELECT * FROM analysis_reports WHERE id = ?'
    ).bind(reportId).first<ReportRecord>();
  }
  
  /**
   * 获取报告完整结果（优先从缓存）
   */
  async getReportResult(reportId: number): Promise<Partial<AnalysisReport> | null> {
    // 先尝试从 KV 缓存获取
    const cached = await this.cache.get(`report:result:${reportId}`, 'json');
    if (cached) {
      return cached as Partial<AnalysisReport>;
    }
    
    // 从数据库获取
    const report = await this.getReport(reportId);
    if (!report || !report.result_json) {
      return null;
    }
    
    const result = JSON.parse(report.result_json);
    
    // 写入缓存
    await this.cache.put(
      `report:result:${reportId}`,
      report.result_json,
      { expirationTtl: 86400 }
    );
    
    return result;
  }
  
  /**
   * 获取用户的报告列表
   */
  async getUserReports(userId: number, limit: number = 20, offset: number = 0): Promise<ReportListItem[]> {
    const results = await this.db.prepare(`
      SELECT id, company_code, company_name, report_type, status, created_at, result_json
      FROM analysis_reports
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all<ReportRecord>();
    
    return (results.results || []).map(r => {
      let score: number | undefined;
      let recommendation: string | undefined;
      
      if (r.result_json) {
        try {
          const result = JSON.parse(r.result_json);
          score = result.finalConclusion?.companyQuality?.score;
          recommendation = result.finalConclusion?.recommendation?.action;
        } catch {}
      }
      
      return {
        id: r.id,
        company_code: r.company_code,
        company_name: r.company_name,
        report_type: r.report_type,
        status: r.status,
        created_at: r.created_at,
        score,
        recommendation,
      };
    });
  }
  
  /**
   * 获取用户报告总数
   */
  async getUserReportCount(userId: number): Promise<number> {
    const result = await this.db.prepare(
      'SELECT COUNT(*) as count FROM analysis_reports WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();
    return result?.count || 0;
  }
  
  /**
   * 获取公开的最近分析（供首页展示）
   */
  async getRecentPublicReports(limit: number = 10): Promise<ReportListItem[]> {
    const results = await this.db.prepare(`
      SELECT id, company_code, company_name, report_type, status, created_at, result_json
      FROM analysis_reports
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all<ReportRecord>();
    
    return (results.results || []).map(r => {
      let score: number | undefined;
      let recommendation: string | undefined;
      
      if (r.result_json) {
        try {
          const result = JSON.parse(r.result_json);
          score = result.finalConclusion?.companyQuality?.score;
          recommendation = result.finalConclusion?.recommendation?.action;
        } catch {}
      }
      
      return {
        id: r.id,
        company_code: r.company_code,
        company_name: r.company_name,
        report_type: r.report_type,
        status: r.status,
        created_at: r.created_at,
        score,
        recommendation,
      };
    });
  }
  
  /**
   * 删除报告
   */
  async deleteReport(reportId: number, userId: number): Promise<boolean> {
    const result = await this.db.prepare(
      'DELETE FROM analysis_reports WHERE id = ? AND user_id = ?'
    ).bind(reportId, userId).run();
    
    if (result.meta.changes > 0) {
      // 清理缓存
      await this.cache.delete(`report:result:${reportId}`);
      await this.cache.delete(`report:progress:${reportId}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * 更新漫画状态
   */
  async updateComicStatus(reportId: number, comicStatus: string, comicId?: number): Promise<void> {
    await this.db.prepare(`
      UPDATE analysis_reports 
      SET comic_status = ?, comic_id = ?, updated_at = datetime("now")
      WHERE id = ?
    `).bind(comicStatus, comicId || null, reportId).run();
  }
  
  /**
   * 获取同公司的历史报告列表（用于对比选择）
   */
  async getCompanyReports(companyCode: string, excludeReportId?: number, limit: number = 10): Promise<ReportListItem[]> {
    let query = `
      SELECT id, company_code, company_name, report_type, report_period, status, created_at, result_json
      FROM analysis_reports
      WHERE company_code = ? AND status = 'completed'
    `;
    const params: (string | number)[] = [companyCode];
    
    if (excludeReportId) {
      query += ' AND id != ?';
      params.push(excludeReportId);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const stmt = this.db.prepare(query);
    const results = await stmt.bind(...params).all<ReportRecord>();
    
    return (results.results || []).map(r => {
      let score: number | undefined;
      let recommendation: string | undefined;
      
      if (r.result_json) {
        try {
          const result = JSON.parse(r.result_json);
          score = result.finalConclusion?.companyQuality?.score || result.finalConclusion?.summary?.score;
          recommendation = result.finalConclusion?.recommendation?.action;
        } catch {}
      }
      
      return {
        id: r.id,
        company_code: r.company_code,
        company_name: r.company_name,
        report_type: r.report_type,
        report_period: r.report_period,
        status: r.status,
        created_at: r.created_at,
        score,
        recommendation,
      };
    });
  }
  
  /**
   * 对比两份报告，提取关键指标变化
   */
  async compareReports(baseReportId: number, compareReportId: number): Promise<ReportComparison | null> {
    const [baseReport, compareReport] = await Promise.all([
      this.getReportResult(baseReportId),
      this.getReportResult(compareReportId)
    ]);
    
    if (!baseReport || !compareReport) {
      return null;
    }
    
    // 提取关键指标进行对比
    const baseMetrics = this.extractKeyMetrics(baseReport);
    const compareMetrics = this.extractKeyMetrics(compareReport);
    
    // 计算变化
    const changes: MetricChange[] = [];
    for (const key of Object.keys(baseMetrics)) {
      const baseValue = baseMetrics[key];
      const compareValue = compareMetrics[key];
      
      if (baseValue !== undefined && compareValue !== undefined) {
        const change = baseValue - compareValue;
        const changePercent = compareValue !== 0 ? (change / Math.abs(compareValue)) * 100 : 0;
        
        changes.push({
          metric: key,
          metricName: this.getMetricName(key),
          baseValue,
          compareValue,
          change,
          changePercent,
          trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
        });
      }
    }
    
    // 生成对比摘要
    const summary = this.generateComparisonSummary(changes);
    
    return {
      baseReportId,
      compareReportId,
      baseDate: (await this.getReport(baseReportId))?.created_at || '',
      compareDate: (await this.getReport(compareReportId))?.created_at || '',
      changes,
      summary
    };
  }
  
  /**
   * 从报告中提取关键财务指标
   */
  private extractKeyMetrics(report: Partial<AnalysisReport>): Record<string, number> {
    const metrics: Record<string, number> = {};
    const conclusion = report.finalConclusion;
    const profitability = report.profitabilityResult || (report as any).profitability;
    const risk = report.riskResult || (report as any).risk;
    const valuation = report.valuationResult || (report as any).valuation;
    
    // 评分指标
    if (conclusion?.companyQuality?.score) metrics.overallScore = conclusion.companyQuality.score;
    if (conclusion?.summary?.score) metrics.overallScore = metrics.overallScore || conclusion.summary.score;
    
    // 盈利能力指标
    if (profitability?.metrics) {
      const pm = profitability.metrics;
      if (pm.grossProfitMargin) metrics.grossProfitMargin = pm.grossProfitMargin;
      if (pm.netProfitMargin) metrics.netProfitMargin = pm.netProfitMargin;
      if (pm.roe) metrics.roe = pm.roe;
      if (pm.roa) metrics.roa = pm.roa;
    }
    
    // 风险指标
    if (risk?.metrics) {
      const rm = risk.metrics;
      if (rm.debtRatio) metrics.debtRatio = rm.debtRatio;
      if (rm.currentRatio) metrics.currentRatio = rm.currentRatio;
      if (rm.quickRatio) metrics.quickRatio = rm.quickRatio;
    }
    
    // 估值指标
    if (valuation?.metrics) {
      const vm = valuation.metrics;
      if (vm.pe) metrics.pe = vm.pe;
      if (vm.pb) metrics.pb = vm.pb;
      if (vm.ps) metrics.ps = vm.ps;
    }
    
    return metrics;
  }
  
  /**
   * 获取指标中文名称
   */
  private getMetricName(key: string): string {
    const names: Record<string, string> = {
      overallScore: '综合评分',
      grossProfitMargin: '毛利率',
      netProfitMargin: '净利率',
      roe: 'ROE',
      roa: 'ROA',
      debtRatio: '资产负债率',
      currentRatio: '流动比率',
      quickRatio: '速动比率',
      pe: '市盈率',
      pb: '市净率',
      ps: '市销率'
    };
    return names[key] || key;
  }
  
  /**
   * 生成对比摘要
   */
  private generateComparisonSummary(changes: MetricChange[]): ComparisonSummary {
    const improved = changes.filter(c => 
      (c.metric.includes('Margin') || c.metric.includes('roe') || c.metric.includes('roa') || c.metric === 'overallScore') && c.trend === 'up' ||
      (c.metric.includes('Ratio') && !c.metric.includes('debt')) && c.trend === 'up' ||
      c.metric.includes('debt') && c.trend === 'down'
    );
    
    const declined = changes.filter(c => 
      (c.metric.includes('Margin') || c.metric.includes('roe') || c.metric.includes('roa') || c.metric === 'overallScore') && c.trend === 'down' ||
      (c.metric.includes('Ratio') && !c.metric.includes('debt')) && c.trend === 'down' ||
      c.metric.includes('debt') && c.trend === 'up'
    );
    
    const overallTrend = improved.length > declined.length ? 'improving' : 
                         declined.length > improved.length ? 'declining' : 'stable';
    
    const highlights = improved.slice(0, 3).map(c => 
      `${c.metricName}${c.trend === 'up' ? '上升' : '下降'}${Math.abs(c.changePercent).toFixed(1)}%`
    );
    
    const concerns = declined.slice(0, 3).map(c => 
      `${c.metricName}${c.trend === 'up' ? '上升' : '下降'}${Math.abs(c.changePercent).toFixed(1)}%`
    );
    
    return {
      overallTrend,
      improvedCount: improved.length,
      declinedCount: declined.length,
      stableCount: changes.length - improved.length - declined.length,
      highlights,
      concerns
    };
  }
}

// 类型定义
interface MetricChange {
  metric: string;
  metricName: string;
  baseValue: number;
  compareValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

interface ComparisonSummary {
  overallTrend: 'improving' | 'declining' | 'stable';
  improvedCount: number;
  declinedCount: number;
  stableCount: number;
  highlights: string[];
  concerns: string[];
}

interface ReportComparison {
  baseReportId: number;
  compareReportId: number;
  baseDate: string;
  compareDate: string;
  changes: MetricChange[];
  summary: ComparisonSummary;
}

export function createReportsService(db: D1Database, cache: KVNamespace): ReportsService {
  return new ReportsService(db, cache);
}
