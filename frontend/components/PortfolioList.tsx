import React, { useMemo, useRef, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, DollarSign, FileText, ArrowRight, Percent, Building2 } from 'lucide-react';
import { Property, ViewProps } from '../types';
import { Card } from './ui/Card';
import { myProperties } from './views/Dashboard';
import { AssetActivityTimeline } from './views/AssetActivityTimeline';

// ----------------------------------------------------------------------
// TYPES & INTERFACES
// ----------------------------------------------------------------------

interface PortfolioListProps extends ViewProps {
  onBack?: () => void;
}

interface Transaction {
  id: string;
  propertyId: string;
  propertyName: string;
  date: string;
  type: '매매' | '전세' | '월세';
  price: number;
  area: number;
  location: string;
}

interface AdvancedMetrics {
  incomeTax: number;
  capitalGainsTax: number;
  propertyTax: number;
  totalTax: number;
  netProfit: number;
}

// ----------------------------------------------------------------------
// DATA
// ----------------------------------------------------------------------


const generateTransactionHistory = (): Transaction[] => {
  const transactions: Transaction[] = [];
  const types: ('매매' | '전세' | '월세')[] = ['매매', '전세', '월세'];
  const dates = [
    '2024-12-15', '2024-12-10', '2024-12-05', '2024-11-28', 
    '2024-11-20', '2024-11-15', '2024-11-08', '2024-11-01',
    '2024-10-25', '2024-10-18', '2024-10-10', '2024-10-05'
  ];

  myProperties.forEach((prop, idx) => {
    dates.forEach((date, dateIdx) => {
      if (dateIdx < 4) { // 각 부동산당 최근 4개 거래만
        transactions.push({
          id: `t-${prop.id}-${dateIdx}`,
          propertyId: prop.id,
          propertyName: prop.name,
          date,
          type: types[dateIdx % 3],
          price: prop.currentPrice + (Math.random() - 0.5) * 5000,
          area: prop.area,
          location: prop.location,
        });
      }
    });
  });

  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const calculateAdvancedMetrics = (properties: Property[]): AdvancedMetrics => {
  const totalProfit = properties.reduce((sum, p) => {
    const profit = p.currentPrice - p.purchasePrice;
    return sum + (profit > 0 ? profit : 0);
  }, 0);

  // 간단한 세금 계산 (실제로는 더 복잡함)
  const capitalGainsTax = totalProfit * 0.06; // 양도소득세 6%
  const propertyTax = properties.reduce((sum, p) => sum + p.currentPrice * 0.001, 0); // 재산세 0.1%
  const incomeTax = totalProfit * 0.14; // 종합소득세 14%
  const totalTax = capitalGainsTax + propertyTax + incomeTax;
  const netProfit = totalProfit - totalTax;

  return {
    incomeTax: Math.round(incomeTax),
    capitalGainsTax: Math.round(capitalGainsTax),
    propertyTax: Math.round(propertyTax),
    totalTax: Math.round(totalTax),
    netProfit: Math.round(netProfit),
  };
};

// ----------------------------------------------------------------------
// HELPER COMPONENTS
// ----------------------------------------------------------------------

const FormatPriceWithUnit = ({ value, isDiff = false }: { value: number, isDiff?: boolean }) => {
  const absVal = Math.floor(Math.abs(value)); // 소수점 제거
  const eok = Math.floor(absVal / 10000);
  const man = absVal % 10000;
  
  // 1억 미만인 경우 만원 단위로 표시
  if (eok === 0) {
    return (
      <span className="tabular-nums tracking-tight">
        <span className="font-bold">{man}</span>
        <span className="font-medium opacity-70 ml-0.5">만원</span>
      </span>
    );
  }

  // 1억 이상인 경우 억 단위로 표시 (0억은 표시하지 않음)
  return (
    <span
      className="tabular-nums tracking-tight"
      style={{
        fontFamily:
          "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <span className="font-bold">{eok}</span>
      <span className="font-medium opacity-70 ml-0.5 mr-1">억</span>
      {man > 0 && (
        <>
          <span className="font-bold">{man}</span>
        </>
      )}
    </span>
  );
};

const PropertyCard: React.FC<{ 
  property: Property; 
  rank: number;
  onClick: () => void;
  isProfit: boolean;
}> = ({ property, rank, onClick, isProfit }) => {
  const profit = property.currentPrice - property.purchasePrice;
  const profitRate = property.purchasePrice > 0 ? (profit / property.purchasePrice) * 100 : 0;

  return (
    <Card 
      onClick={onClick}
      className="p-4 bg-white border border-[#E2E8F0] hover:shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)] transition-all duration-300 cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-base ${
            isProfit 
              ? 'bg-[#FEE2E2] text-[#E11D48]' 
              : 'bg-[#DBEAFE] text-[#2563EB]'
          }`}>
            {rank}
          </div>
          <div>
            <h3 className="font-bold text-base text-[#0F172A] mb-0.5 group-hover:text-[#2563EB] transition-colors line-clamp-1">
              {property.name}
            </h3>
            <p className="text-xs text-[#64748B] font-medium">{property.location}</p>
          </div>
        </div>
        {isProfit ? (
          <TrendingUp className="w-4 h-4 text-[#E11D48] flex-shrink-0" />
        ) : (
          <TrendingDown className="w-4 h-4 text-[#2563EB] flex-shrink-0" />
        )}
      </div>
      
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#64748B] font-medium">현재 시세</span>
          <span className="font-bold text-base text-[#1E293B] tabular-nums">
            <FormatPriceWithUnit value={property.currentPrice} />
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#64748B] font-medium">수익률</span>
          <span className={`font-bold text-base tabular-nums ${
            isProfit ? 'text-[#E11D48]' : 'text-[#2563EB]'
          }`}>
            {isProfit ? '+' : ''}{profitRate.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-[#E2E8F0]">
          <span className="text-xs text-[#64748B] font-medium">수익금</span>
          <span className={`font-bold text-sm tabular-nums ${
            isProfit ? 'text-[#E11D48]' : 'text-[#2563EB]'
          }`}>
            {isProfit ? '+' : ''}<FormatPriceWithUnit value={Math.abs(profit)} isDiff />
          </span>
        </div>
      </div>
    </Card>
  );
};

const EmptyPropertyCard: React.FC = () => {
  return (
    <Card 
      className="p-4 border border-[#E2E8F0] bg-white"
    >
      <div className="flex flex-col items-center justify-center py-6 text-[#94A3B8]">
        <div className="w-12 h-12 rounded-xl bg-[#F1F5F9] flex items-center justify-center mb-3">
          <FileText className="w-6 h-6" />
        </div>
        <p className="text-xs font-medium">데이터가 없습니다</p>
      </div>
    </Card>
  );
};

const TransactionItem: React.FC<{ 
  transaction: Transaction; 
  onClick: () => void;
}> = ({ transaction, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="py-3 px-0 border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC] transition-colors duration-200 cursor-pointer group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-bold text-sm text-[#0F172A] group-hover:text-[#2563EB] transition-colors truncate">
              {transaction.propertyName}
            </h4>
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
              transaction.type === '매매' 
                ? 'bg-[#FEE2E2] text-[#E11D48]' 
                : transaction.type === '전세'
                ? 'bg-[#DBEAFE] text-[#2563EB]'
                : 'bg-[#F3E8FF] text-[#9333EA]'
            }`}>
              {transaction.type}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium">
            <span>{transaction.location}</span>
            <span className="w-1 h-1 bg-[#94A3B8] rounded-full"></span>
            <span>{transaction.area}㎡</span>
            <span className="w-1 h-1 bg-[#94A3B8] rounded-full"></span>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{transaction.date}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-bold text-sm text-[#1E293B] tabular-nums">
            <FormatPriceWithUnit value={transaction.price} />
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#2563EB] transition-colors" />
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// MAIN COMPONENT
// ----------------------------------------------------------------------

export const PortfolioList: React.FC<PortfolioListProps> = ({ onPropertyClick, onBack }) => {
  const transactions = useMemo(() => generateTransactionHistory(), []);
  const advancedMetrics = useMemo(() => calculateAdvancedMetrics(myProperties), []);
  
  // 가장 수익률 높은 부동산 3개
  const topProfitProperties = useMemo(() => {
    return [...myProperties]
      .filter(p => p.changeRate > 0)
      .sort((a, b) => b.changeRate - a.changeRate)
      .slice(0, 3);
  }, []);

  // 가장 손해 높은 부동산 3개
  const topLossProperties = useMemo(() => {
    return [...myProperties]
      .filter(p => p.changeRate < 0)
      .sort((a, b) => a.changeRate - b.changeRate)
      .slice(0, 3);
  }, []);

  const leftColumnRef = useRef<HTMLDivElement>(null);
  const [rightCardHeight, setRightCardHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const updateHeight = () => {
      if (leftColumnRef.current) {
        // getBoundingClientRect를 사용하여 정확한 높이 계산
        const rect = leftColumnRef.current.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(leftColumnRef.current);
        const height = rect.height;
        
        // 높이가 유효하고 합리적인 범위 내에 있는지 확인 (너무 크면 무시)
        if (height > 0 && height < 5000) {
          setRightCardHeight(Math.floor(height));
        }
      }
    };

    // 즉시 실행
    updateHeight();
    
    // 여러 번 시도하여 확실하게 높이 계산
    const timeouts = [
      setTimeout(updateHeight, 0),
      setTimeout(updateHeight, 100),
      setTimeout(updateHeight, 300),
      setTimeout(updateHeight, 500),
    ];

    // ResizeObserver로 좌측 컬럼 크기 변화 감지
    let resizeObserver: ResizeObserver | null = null;
    if (leftColumnRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const height = entry.contentRect.height;
          if (height > 0 && height < 5000) {
            setRightCardHeight(Math.floor(height));
          }
        }
      });
      resizeObserver.observe(leftColumnRef.current);
    }

    // 윈도우 리사이즈 이벤트
    window.addEventListener('resize', updateHeight);
    
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
      window.removeEventListener('resize', updateHeight);
      if (resizeObserver && leftColumnRef.current) {
        resizeObserver.unobserve(leftColumnRef.current);
      }
    };
  }, []);

  // 포트폴리오 성과 지표 계산
  const portfolioMetrics = useMemo(() => {
    const totalValue = myProperties.reduce((sum, p) => sum + p.currentPrice, 0);
    const totalPurchaseValue = myProperties.reduce((sum, p) => sum + p.purchasePrice, 0);
    const totalProfit = totalValue - totalPurchaseValue;
    const avgProfitRate = totalPurchaseValue > 0 ? (totalProfit / totalPurchaseValue) * 100 : 0;
    const maxProfitRate = Math.max(...myProperties.map(p => p.changeRate));
    const minProfitRate = Math.min(...myProperties.map(p => p.changeRate));
    const profitCount = myProperties.filter(p => p.changeRate > 0).length;
    const lossCount = myProperties.filter(p => p.changeRate < 0).length;
    
    // 평균 보유 기간 계산 (월 단위)
    const avgHoldingMonths = myProperties.reduce((sum, p) => {
      if (p.purchaseDate === '-') return sum;
      const purchaseDate = new Date(p.purchaseDate + '-01');
      const now = new Date();
      const months = (now.getFullYear() - purchaseDate.getFullYear()) * 12 + (now.getMonth() - purchaseDate.getMonth());
      return sum + Math.max(0, months);
    }, 0) / myProperties.filter(p => p.purchaseDate !== '-').length;

    return {
      totalValue,
      totalPurchaseValue,
      totalProfit,
      avgProfitRate,
      maxProfitRate,
      minProfitRate,
      profitCount,
      lossCount,
      totalCount: myProperties.length,
      avgHoldingMonths: Math.round(avgHoldingMonths) || 0,
    };
  }, []);

  return (
    <div className="relative">
      <div className="mx-auto px-6 py-8 max-w-[1600px]">
        <div className="grid grid-cols-12 gap-6">
          {/* 좌측 컬럼 */}
          <div ref={leftColumnRef} className="col-span-12 lg:col-span-7 space-y-6 self-start">
            {/* 전문적인 그래프 섹션 (그라데이션 배경) */}
            <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] bg-noise rounded-[28px] p-8 text-white shadow-deep relative overflow-hidden border border-white/5">
              <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] glow-blue blur-[120px] pointer-events-none"></div>
              <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] glow-cyan blur-[100px] pointer-events-none"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-white mb-1">포트폴리오 성과 분석</h2>
                    <p className="text-base text-slate-300 font-bold">종합적인 부동산 투자 성과 및 수익률 분석</p>
                  </div>
                </div>

                {/* 주요 지표 카드들 */}
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-6">
                  <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-[#64748B]" />
                      </div>
                      <p className="text-sm text-[#64748B] font-bold">총 자산 가치</p>
                    </div>
                    <p className="text-xl font-black text-[#1E293B] tabular-nums">
                      <FormatPriceWithUnit value={portfolioMetrics.totalValue} />
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                        <Percent className="w-4 h-4 text-[#64748B]" />
                      </div>
                      <p className="text-sm text-[#64748B] font-bold">평균 수익률</p>
                    </div>
                    <p className={`text-xl font-black tabular-nums ${
                      portfolioMetrics.avgProfitRate >= 0 ? 'text-[#E11D48]' : 'text-[#2563EB]'
                    }`}>
                      {portfolioMetrics.avgProfitRate >= 0 ? '+' : ''}{portfolioMetrics.avgProfitRate.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* 추가 지표 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <div className="bg-white rounded-lg p-3 border border-[#E2E8F0] shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
                    <p className="text-sm text-[#64748B] font-bold mb-1">총 수익/손실</p>
                    <p className={`text-lg font-black tabular-nums ${
                      portfolioMetrics.totalProfit >= 0 ? 'text-[#E11D48]' : 'text-[#2563EB]'
                    }`}>
                      {portfolioMetrics.totalProfit >= 0 ? '+' : ''}<FormatPriceWithUnit value={Math.abs(portfolioMetrics.totalProfit)} isDiff />
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-[#E2E8F0] shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
                    <p className="text-sm text-[#64748B] font-bold mb-1">수익 자산</p>
                    <p className="text-lg font-black text-[#E11D48] tabular-nums">
                      {portfolioMetrics.profitCount}개
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-[#E2E8F0] shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
                    <p className="text-sm text-[#64748B] font-bold mb-1">손실 자산</p>
                    <p className="text-lg font-black text-[#2563EB] tabular-nums">
                      {portfolioMetrics.lossCount}개
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-[#E2E8F0] shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)]">
                    <p className="text-sm text-[#64748B] font-bold mb-1">평균 보유 기간</p>
                    <p className="text-lg font-black text-[#1E293B] tabular-nums">
                      {portfolioMetrics.avgHoldingMonths}개월
                    </p>
                  </div>
                </div>

                {/* 최고/최저 수익 부동산 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-black text-white">최고 수익 부동산</h3>
                    <span className="text-sm text-slate-300 font-bold">상위 3개</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {topProfitProperties.length > 0 ? (
                      topProfitProperties.map((prop, idx) => (
                        <PropertyCard
                          key={prop.id}
                          property={prop}
                          rank={idx + 1}
                          onClick={() => onPropertyClick(prop.id)}
                          isProfit={true}
                        />
                      ))
                    ) : (
                      <>
                        <EmptyPropertyCard />
                        <EmptyPropertyCard />
                        <EmptyPropertyCard />
                      </>
                    )}
                    {topProfitProperties.length < 3 && Array.from({ length: 3 - topProfitProperties.length }).map((_, idx) => (
                      <EmptyPropertyCard key={`empty-profit-${idx}`} />
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-black text-white">최대 손실 부동산</h3>
                    <span className="text-sm text-slate-300 font-bold">하위 3개</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {topLossProperties.length > 0 ? (
                      topLossProperties.map((prop, idx) => (
                        <PropertyCard
                          key={prop.id}
                          property={prop}
                          rank={idx + 1}
                          onClick={() => onPropertyClick(prop.id)}
                          isProfit={false}
                        />
                      ))
                    ) : (
                      <>
                        <EmptyPropertyCard />
                        <EmptyPropertyCard />
                        <EmptyPropertyCard />
                      </>
                    )}
                    {topLossProperties.length < 3 && Array.from({ length: 3 - topLossProperties.length }).map((_, idx) => (
                      <EmptyPropertyCard key={`empty-loss-${idx}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced 지표 (소득세 등) */}
            <div className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)] border border-[#E2E8F0]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-[#0F172A]">세금 및 수익 분석</h2>
                <div className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-[#64748B]" />
                </div>
              </div>
              
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#64748B] font-medium mb-2">종합소득세</p>
                    <p className="text-lg font-black text-[#1E293B] tabular-nums">
                      <FormatPriceWithUnit value={advancedMetrics.incomeTax} />
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#64748B] font-medium mb-2">양도소득세</p>
                    <p className="text-lg font-black text-[#1E293B] tabular-nums">
                      <FormatPriceWithUnit value={advancedMetrics.capitalGainsTax} />
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <p className="text-xs text-[#64748B] font-medium mb-2">재산세</p>
                    <p className="text-lg font-black text-[#1E293B] tabular-nums">
                      <FormatPriceWithUnit value={advancedMetrics.propertyTax} />
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#DBEAFE] border border-[#BFDBFE]">
                    <p className="text-xs text-[#2563EB] font-medium mb-2">총 세금</p>
                    <p className="text-lg font-black text-[#2563EB] tabular-nums">
                      <FormatPriceWithUnit value={advancedMetrics.totalTax} />
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-[#FEE2E2] border border-[#FECACA]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#E11D48] font-medium mb-1">순수익 (세후)</p>
                      <p className="text-2xl font-black text-[#E11D48] tabular-nums">
                        <FormatPriceWithUnit value={advancedMetrics.netProfit} />
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-[#E11D48] opacity-50" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 우측 컬럼 - 거래 내역 리스트 */}
          <div className="col-span-12 lg:col-span-5 flex flex-col">
            <div 
              className="bg-white rounded-[24px] p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_0_rgba(0,0,0,0.06)] border border-[#E2E8F0] flex flex-col overflow-hidden" 
              style={rightCardHeight ? { 
                height: `${rightCardHeight}px`, 
                maxHeight: `${rightCardHeight}px`
              } : {}}
            >
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <h2 className="text-xl font-black text-[#0F172A]">최근 거래 내역</h2>
                <button className="text-sm text-[#2563EB] font-bold hover:text-[#1D4ED8] flex items-center gap-1">
                  전체보기
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 pr-2 custom-scrollbar" style={{ 
                maxHeight: rightCardHeight ? `calc(${rightCardHeight}px - 100px)` : 'none',
                overflowY: 'scroll',
                height: rightCardHeight ? `calc(${rightCardHeight}px - 100px)` : 'auto'
              }}>
                {transactions.length > 0 ? (
                  <div className="space-y-0">
                    {transactions.map(transaction => (
                      <TransactionItem
                        key={transaction.id}
                        transaction={transaction}
                        onClick={() => onPropertyClick(transaction.propertyId)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-[#94A3B8]">
                    <div className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
                      <FileText className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium">거래 내역이 없습니다</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* 자산 활동 타임라인 */}
        <div className="col-span-12 mt-6">
          <AssetActivityTimeline />
        </div>
      </div>
    </div>
  );
};
