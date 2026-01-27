import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Home, TrendingUp } from 'lucide-react';
import { ProfessionalChart, ChartSeriesData } from '../ui/ProfessionalChart';
import { fetchApartmentTransactions, ApartmentTransactionsResponse } from '../../services/api';

interface MobileSuccessStepProps {
    aptId: number;
    aptName: string;
    onNext: () => void;
}

export const MobileSuccessStep: React.FC<MobileSuccessStepProps> = ({
    aptId,
    aptName,
    onNext,
}) => {
    const [chartData, setChartData] = useState<ChartSeriesData[]>([]);
    const [loading, setLoading] = useState(true);
    const [aptInfo, setAptInfo] = useState<{
        recentPrice: number;
        changeRate: number;
        area: number;
    } | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // 최근 3년(36개월) 매매 데이터 조회
                const response = await fetchApartmentTransactions(aptId, 'sale', 100, 36);

                if (response.success && response.data) {
                    const { price_trend, change_summary, recent_transactions } = response.data;

                    // 차트 데이터 변환
                    if (price_trend && price_trend.length > 0) {
                        const chartPoints = price_trend.map(item => ({
                            time: `${item.month}-01`, // YYYY-MM-DD 형식
                            value: item.avg_price // 만원 단위
                        }));

                        setChartData([
                            {
                                name: '매매가',
                                data: chartPoints,
                                color: '#3182F6', // Blue color
                                visible: true
                            }
                        ]);
                    }

                    // 아파트 정보 설정
                    setAptInfo({
                        recentPrice: recent_transactions[0]?.price || 0,
                        changeRate: change_summary.change_rate || 0,
                        area: recent_transactions[0]?.area || 84, // 기본값 84
                    });
                }
            } catch (error) {
                console.error('Failed to fetch apartment data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [aptId]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex flex-col h-full bg-slate-50 relative overflow-hidden"
        >
            {/* 배경 장식 */}
            <div className="absolute top-0 left-0 w-full h-[60%] bg-gradient-to-b from-blue-50/80 to-slate-50 z-0" />

            <div className="flex-1 flex flex-col px-6 pt-12 pb-6 z-10 overflow-y-auto">
                {/* 성공 아이콘 및 메시지 */}
                <div className="flex flex-col items-center text-center mb-8">
                    <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg mb-6 shadow-blue-500/20"
                    >
                        <Check className="w-8 h-8 text-white stroke-[3px]" />
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-2xl font-black text-slate-900 mb-2"
                    >
                        {aptName}
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-slate-500 font-bold"
                    >
                        성공적으로 추가되었어요!
                    </motion.p>
                </div>

                {/* 요약 카드 */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 mb-6"
                >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4" />
                            최근 시세 동향
                        </h3>
                        {aptInfo && (
                            <span className={`text-sm font-black ${aptInfo.changeRate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                {aptInfo.changeRate > 0 ? '+' : ''}{aptInfo.changeRate}%
                            </span>
                        )}
                    </div>

                    <div className="h-[180px] w-full -ml-2">
                        {loading ? (
                            <div className="h-full w-full flex items-center justify-center bg-slate-50 rounded-xl">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <ProfessionalChart
                                series={chartData}
                                height={180}
                                isSparkline={true} // 축 없이 심플하게
                                lineColor="#3B82F6"
                                areaTopColor="rgba(59, 130, 246, 0.1)"
                                areaBottomColor="rgba(59, 130, 246, 0.0)"
                                theme="light"
                            />
                        )}
                    </div>

                    {aptInfo && (
                        <div className="flex justify-between items-end mt-2 pt-4 border-t border-slate-50">
                            <div>
                                <p className="text-xs text-slate-400 font-medium mb-0.5">최근 실거래가</p>
                                <p className="text-lg font-black text-slate-900">
                                    {Math.floor(aptInfo.recentPrice / 10000)}억 {aptInfo.recentPrice % 10000 > 0 ? `${(aptInfo.recentPrice % 10000).toLocaleString()}만` : ''}원
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400 font-medium mb-0.5">전용면적</p>
                                <p className="text-sm font-bold text-slate-700">{aptInfo.area}㎡</p>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* 하단 버튼 */}
                <div className="mt-auto">
                    <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        onClick={onNext}
                        className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-[20px] font-bold text-[16px] shadow-lg shadow-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        이제 시작하기
                        <ChevronRight className="w-5 h-5 opacity-70" />
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
};
