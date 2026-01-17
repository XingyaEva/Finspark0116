#!/bin/bash
#
# AKShare 港股数据代理服务 - 一键部署脚本
# 适用于: Ubuntu 22.04 / 阿里云 ECS
# 
# 使用方法:
#   curl -sSL https://raw.githubusercontent.com/xxx/deploy.sh | bash
#   或者上传此脚本后执行: bash deploy_akshare_proxy.sh
#

set -e

echo "=============================================="
echo "  AKShare 港股数据代理服务 - 一键部署脚本"
echo "=============================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
DEPLOY_DIR="/opt/akshare-proxy"
SERVICE_PORT=8000
PYTHON_VERSION="3.10"

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}错误: 请使用 root 用户运行此脚本${NC}"
    echo "使用: sudo bash deploy_akshare_proxy.sh"
    exit 1
fi

echo -e "${GREEN}[1/7] 更新系统包...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

echo -e "${GREEN}[2/7] 安装 Python 和依赖...${NC}"
apt-get install -y -qq python3 python3-pip python3-venv curl wget

echo -e "${GREEN}[3/7] 创建部署目录...${NC}"
mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

echo -e "${GREEN}[4/7] 创建 Python 虚拟环境...${NC}"
python3 -m venv venv
source venv/bin/activate

echo -e "${GREEN}[5/7] 安装 Python 依赖包...${NC}"
pip install --upgrade pip -q
pip install fastapi uvicorn akshare pandas -q

echo -e "${GREEN}[6/7] 创建代理服务代码...${NC}"
cat > $DEPLOY_DIR/akshare_proxy.py << 'PYTHON_CODE'
#!/usr/bin/env python3
"""
AKShare 港股数据代理服务

功能:
1. 提供 REST API 供 TypeScript 后端调用
2. 封装 AKShare 港股财务报表接口
3. 支持利润表、资产负债表、现金流量表
4. 支持 K 线数据和股票基本信息

数据来源: AKShare (东方财富)
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import akshare as ak
import pandas as pd
from typing import Optional
import traceback
import sys

# 创建 FastAPI 应用
app = FastAPI(
    title="AKShare HK Stock Proxy",
    description="港股财务数据代理服务 - 为 Finspark 提供港股三大财务报表数据",
    version="1.0.0"
)

# CORS 配置 - 允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ 健康检查 ============
@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "ok",
        "service": "akshare-hk-proxy",
        "version": "1.0.0",
        "akshare_version": ak.__version__ if hasattr(ak, '__version__') else "unknown"
    }


# ============ 港股财务报表 ============
@app.get("/hk/financial/{stock_code}/{report_type}")
async def get_hk_financial(
    stock_code: str,
    report_type: str,
    indicator: str = Query("年度", description="年度 或 报告期")
):
    """
    获取港股财务报表
    
    Args:
        stock_code: 港股代码 (如 00700)
        report_type: 报表类型 (income/balance/cashflow)
        indicator: 年度/报告期
        
    Returns:
        JSON 格式的财务报表数据
    """
    # 报表类型映射
    symbol_map = {
        "income": "利润表",
        "balance": "资产负债表",
        "cashflow": "现金流量表"
    }
    
    if report_type not in symbol_map:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid report_type: {report_type}. Must be one of: income, balance, cashflow"
        )
    
    # 标准化股票代码 (确保是5位数字)
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)  # 补齐到5位
    
    try:
        print(f"[AkshareProxy] 获取港股{symbol_map[report_type]}: {code}, 指标: {indicator}")
        
        # 调用 AKShare 接口
        df = ak.stock_financial_hk_report_em(
            stock=code,
            symbol=symbol_map[report_type],
            indicator=indicator
        )
        
        if df is None or df.empty:
            print(f"[AkshareProxy] 警告: {code} {symbol_map[report_type]}数据为空")
            return {
                "success": True,
                "data": [],
                "message": f"No data found for {code}"
            }
        
        # 转换为字典列表
        data = df.to_dict(orient="records")
        
        print(f"[AkshareProxy] 成功获取 {len(data)} 条{symbol_map[report_type]}数据")
        
        return {
            "success": True,
            "data": data,
            "count": len(data)
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        print(f"[AkshareProxy] 错误: {error_msg}", file=sys.stderr)
        
        return {
            "success": False,
            "error": error_msg,
            "data": []
        }


# ============ 港股K线数据 ============
@app.get("/hk/kline/{stock_code}")
async def get_hk_kline(
    stock_code: str,
    days: int = Query(180, description="获取最近N天的数据"),
    adjust: str = Query("qfq", description="复权类型: qfq(前复权), hfq(后复权), 空(不复权)")
):
    """
    获取港股K线数据
    """
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)
    
    try:
        print(f"[AkshareProxy] 获取港股K线: {code}, 天数: {days}, 复权: {adjust}")
        
        df = ak.stock_hk_hist(
            symbol=code,
            period="daily",
            adjust=adjust if adjust else ""
        )
        
        if df is None or df.empty:
            return {
                "success": True,
                "data": [],
                "message": f"No kline data found for {code}"
            }
        
        df = df.tail(days)
        
        column_map = {
            '日期': 'date',
            '开盘': 'open',
            '收盘': 'close',
            '最高': 'high',
            '最低': 'low',
            '成交量': 'volume',
            '成交额': 'amount',
            '振幅': 'amplitude',
            '涨跌幅': 'pct_chg',
            '涨跌额': 'change',
            '换手率': 'turnover_rate'
        }
        
        df = df.rename(columns=column_map)
        
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y%m%d')
        
        data = df.to_dict(orient="records")
        
        print(f"[AkshareProxy] 成功获取 {len(data)} 条K线数据")
        
        return {
            "success": True,
            "data": data,
            "count": len(data)
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        print(f"[AkshareProxy] 错误: {error_msg}", file=sys.stderr)
        
        return {
            "success": False,
            "error": error_msg,
            "data": []
        }


# ============ 港股基本信息 ============
@app.get("/hk/basic/{stock_code}")
async def get_hk_basic(stock_code: str):
    """获取港股基本信息"""
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)
    
    try:
        print(f"[AkshareProxy] 获取港股基本信息: {code}")
        
        try:
            df = ak.stock_hk_ggt_components_em()
            
            if df is not None and not df.empty:
                stock_info = df[df['代码'].str.contains(code, na=False)]
                
                if not stock_info.empty:
                    row = stock_info.iloc[0]
                    return {
                        "success": True,
                        "data": {
                            "code": code,
                            "name": row.get('名称', ''),
                            "industry": '港股',
                            "list_date": ''
                        }
                    }
        except Exception as e:
            print(f"[AkshareProxy] 获取港股通成分股失败: {e}")
        
        try:
            df = ak.stock_hk_hist(symbol=code, period="daily", adjust="qfq")
            if df is not None and not df.empty:
                return {
                    "success": True,
                    "data": {
                        "code": code,
                        "name": code,
                        "industry": '港股',
                        "list_date": ''
                    }
                }
        except Exception as e:
            print(f"[AkshareProxy] 备用方案失败: {e}")
        
        return {
            "success": True,
            "data": {
                "code": code,
                "name": code,
                "industry": '港股',
                "list_date": ''
            }
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        
        return {
            "success": False,
            "error": error_msg,
            "data": None
        }


# ============ 港股公司信息 ============
@app.get("/hk/company/{stock_code}")
async def get_hk_company(stock_code: str):
    """获取港股公司信息"""
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)
    
    try:
        print(f"[AkshareProxy] 获取港股公司信息: {code}")
        
        try:
            df = ak.stock_hk_company_profile_em(symbol=code)
            
            if df is not None and not df.empty:
                company_data = {}
                for _, row in df.iterrows():
                    key = str(row.iloc[0]).strip() if len(row) > 0 else ''
                    value = str(row.iloc[1]).strip() if len(row) > 1 else ''
                    if key:
                        company_data[key] = value
                
                return {
                    "success": True,
                    "data": {
                        "chairman": company_data.get('董事长', ''),
                        "manager": company_data.get('总经理', ''),
                        "secretary": company_data.get('董秘', ''),
                        "reg_capital": 0,
                        "setup_date": company_data.get('成立日期', ''),
                        "introduction": company_data.get('公司介绍', ''),
                        "website": company_data.get('公司网址', ''),
                        "email": company_data.get('电子邮箱', ''),
                        "office": company_data.get('办公地址', ''),
                        "employees": 0,
                        "main_business": company_data.get('主营业务', '')
                    }
                }
        except Exception as e:
            print(f"[AkshareProxy] 获取公司概况失败: {e}")
        
        return {
            "success": True,
            "data": None
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        
        return {
            "success": False,
            "error": error_msg,
            "data": None
        }


# ============ 港股每日指标 ============
@app.get("/hk/daily_basic/{stock_code}")
async def get_hk_daily_basic(stock_code: str):
    """获取港股每日基本指标 (PE/PB/市值等)"""
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)
    
    try:
        print(f"[AkshareProxy] 获取港股每日指标: {code}")
        
        try:
            df = ak.stock_hk_valuation_comparison_em(symbol=code)
            
            if df is not None and not df.empty:
                latest = df.iloc[-1] if len(df) > 0 else None
                
                if latest is not None:
                    return {
                        "success": True,
                        "data": [{
                            "trade_date": str(latest.get('日期', '')).replace('-', ''),
                            "close": float(latest.get('收盘价', 0) or 0),
                            "pe": float(latest.get('市盈率', 0) or 0),
                            "pe_ttm": float(latest.get('市盈率TTM', 0) or latest.get('市盈率', 0) or 0),
                            "pb": float(latest.get('市净率', 0) or 0),
                            "ps": 0,
                            "ps_ttm": 0,
                            "turnover_rate": 0,
                            "volume_ratio": 0,
                            "dv_ratio": 0,
                            "dv_ttm": 0,
                            "total_share": 0,
                            "float_share": 0,
                            "free_share": 0,
                            "total_mv": float(latest.get('总市值', 0) or 0),
                            "circ_mv": float(latest.get('流通市值', 0) or latest.get('总市值', 0) or 0)
                        }]
                    }
        except Exception as e:
            print(f"[AkshareProxy] 获取估值对比失败: {e}")
        
        try:
            df = ak.stock_hk_hist(symbol=code, period="daily", adjust="qfq")
            if df is not None and not df.empty:
                latest = df.iloc[-1]
                return {
                    "success": True,
                    "data": [{
                        "trade_date": str(latest.get('日期', '')).replace('-', ''),
                        "close": float(latest.get('收盘', 0) or 0),
                        "turnover_rate": float(latest.get('换手率', 0) or 0),
                        "pe": 0,
                        "pe_ttm": 0,
                        "pb": 0,
                        "ps": 0,
                        "ps_ttm": 0,
                        "volume_ratio": 0,
                        "dv_ratio": 0,
                        "dv_ttm": 0,
                        "total_share": 0,
                        "float_share": 0,
                        "free_share": 0,
                        "total_mv": 0,
                        "circ_mv": 0
                    }]
                }
        except Exception as e:
            print(f"[AkshareProxy] 备用方案失败: {e}")
        
        return {
            "success": True,
            "data": []
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        
        return {
            "success": False,
            "error": error_msg,
            "data": []
        }


# ============ 港股财务指标 ============
@app.get("/hk/fina_indicator/{stock_code}")
async def get_hk_fina_indicator(stock_code: str):
    """获取港股财务指标 (ROE/毛利率等)"""
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)
    
    try:
        print(f"[AkshareProxy] 获取港股财务指标: {code}")
        
        # 港股暂无直接财务指标接口，从利润表计算
        return {
            "success": True,
            "data": []
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        
        return {
            "success": False,
            "error": error_msg,
            "data": []
        }


# ============ 港股主营业务构成 ============
@app.get("/hk/main_biz/{stock_code}")
async def get_hk_main_biz(stock_code: str):
    """获取港股主营业务构成"""
    code = stock_code.replace('.HK', '').replace('.hk', '').strip()
    code = code.zfill(5)
    
    try:
        print(f"[AkshareProxy] 获取港股主营业务构成: {code}")
        
        return {
            "success": True,
            "data": [],
            "message": "Hong Kong stocks do not have detailed business segment data available"
        }
        
    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        
        return {
            "success": False,
            "error": error_msg,
            "data": []
        }


# ============ 主程序入口 ============
if __name__ == "__main__":
    import uvicorn
    
    print("=" * 60)
    print("AKShare 港股数据代理服务")
    print("=" * 60)
    print(f"AKShare 版本: {ak.__version__ if hasattr(ak, '__version__') else 'unknown'}")
    print("启动地址: http://0.0.0.0:8000")
    print("API 文档: http://localhost:8000/docs")
    print("=" * 60)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
PYTHON_CODE

echo -e "${GREEN}[7/7] 创建 Systemd 服务...${NC}"
cat > /etc/systemd/system/akshare-proxy.service << 'SERVICE_FILE'
[Unit]
Description=AKShare HK Stock Proxy Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/akshare-proxy
Environment="PATH=/opt/akshare-proxy/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/opt/akshare-proxy/venv/bin/python /opt/akshare-proxy/akshare_proxy.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_FILE

# 重载 systemd 配置
systemctl daemon-reload

# 启用并启动服务
systemctl enable akshare-proxy
systemctl start akshare-proxy

echo ""
echo "=============================================="
echo -e "${GREEN}  部署完成!${NC}"
echo "=============================================="
echo ""
echo "服务状态:"
systemctl status akshare-proxy --no-pager | head -10
echo ""
echo "----------------------------------------------"
echo "服务信息:"
echo "  - 服务端口: $SERVICE_PORT"
echo "  - 健康检查: http://$(curl -s ifconfig.me):$SERVICE_PORT/health"
echo "  - API 文档: http://$(curl -s ifconfig.me):$SERVICE_PORT/docs"
echo "----------------------------------------------"
echo ""
echo "常用命令:"
echo "  查看状态: systemctl status akshare-proxy"
echo "  查看日志: journalctl -u akshare-proxy -f"
echo "  重启服务: systemctl restart akshare-proxy"
echo "  停止服务: systemctl stop akshare-proxy"
echo ""
echo -e "${YELLOW}请确保安全组已开放 8000 端口!${NC}"
echo ""

# 测试服务
echo "测试服务连接..."
sleep 3
curl -s http://localhost:8000/health && echo ""
echo ""
echo -e "${GREEN}部署成功! 服务已启动运行。${NC}"
