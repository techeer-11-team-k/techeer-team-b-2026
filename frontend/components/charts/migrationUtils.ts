import { SankeyNode, SankeyLink } from '../ui/MigrationSankey';

export type ViewLevel = 'all' | 'simple';

// 파스텔 톤 색상 팔레트 정의
const PASTEL_COLORS = {
  seoul: '#FFB7B2',      // 서울 (Soft Red)
  gyeongin: '#FFDAC1',   // 경인 (Soft Orange)
  chungcheong: '#E2F0CB',// 충청 (Soft Green)
  jeolla: '#B5EAD7',     // 전라 (Mint)
  gyeongsang: '#C7CEEA', // 경상 (Soft Blue)
  gangwon: '#D6A2E8',    // 강원 (Soft Purple)
  jeju: '#FF9AA2',       // 제주 (Pink)
  busan: '#A2E8DD',      // 부산 (Turquoise)
  daegu: '#FDFFB6',      // 대구 (Lemon)
  gwangju: '#FFC8A2',    // 광주 (Salmon)
  daejeon: '#D4F0F0',    // 대전 (Sky)
  ulsan: '#E0BBE4',      // 울산 (Lavender)
  sejong: '#FFDAC1',     // 세종 (Peach) - 경인과 비슷하지만 약간 다르게
  default: '#E2E2E2'     // 기타 (Gray)
};

// 권역 정의 (사용자 요청 반영: 서울, 경인, 충청, 전라, 경상, 광역시별, 세종, 강원, 제주)
const REGION_GROUPS: Record<string, string> = {
  '서울특별시': '서울',
  '경기도': '경인',
  '인천광역시': '경인',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '세종특별자치시': '세종',
  '강원특별자치도': '강원',
  '강원도': '강원',
  '충청북도': '충청',
  '충청남도': '충청',
  '전북특별자치도': '전라',
  '전라북도': '전라',
  '전라남도': '전라',
  '경상북도': '경상',
  '경상남도': '경상',
  '제주특별자치도': '제주',
  '제주도': '제주'
};

const GROUP_COLORS: Record<string, string> = {
  '서울': PASTEL_COLORS.seoul,
  '경인': PASTEL_COLORS.gyeongin,
  '충청': PASTEL_COLORS.chungcheong,
  '전라': PASTEL_COLORS.jeolla,
  '경상': PASTEL_COLORS.gyeongsang,
  '강원': PASTEL_COLORS.gangwon,
  '제주': PASTEL_COLORS.jeju,
  '세종': PASTEL_COLORS.sejong,
  '부산': PASTEL_COLORS.busan,
  '대구': PASTEL_COLORS.daegu,
  '광주': PASTEL_COLORS.gwangju,
  '대전': PASTEL_COLORS.daejeon,
  '울산': PASTEL_COLORS.ulsan,
  '기타': PASTEL_COLORS.default
};

interface AggregatedData {
  nodes: any[];
  links: any[];
}

export const aggregateMigrationData = (
  rawNodes: SankeyNode[],
  rawLinks: SankeyLink[],
  level: ViewLevel,
  selectedRegion?: string | null
): AggregatedData => {
  const groupNodesMap = new Map<string, { sum: number; net: number }>();
  const groupLinksMap = new Map<string, number>();

  // 1. 링크 집계 (Drill-down 로직 적용)
  rawLinks.forEach(link => {
    let source = link.from;
    let target = link.to;

    // 권역 정보 조회
    const sourceGroup = REGION_GROUPS[source] || '기타';
    const targetGroup = REGION_GROUPS[target] || '기타';

    if (!selectedRegion) {
      // 1. 초기 화면 (권역별 보기): 모든 지역을 권역으로 변환
      source = sourceGroup;
      target = targetGroup;
    } else {
      // 2. 상세 화면 (Drill-down): 선택된 권역과 관련 있는 링크만 처리
      // 선택된 권역 내부 이동이거나, 선택된 권역과 외부 간의 이동인 경우
      const isSourceInGroup = sourceGroup === selectedRegion;
      const isTargetInGroup = targetGroup === selectedRegion;

      if (!isSourceInGroup && !isTargetInGroup) {
        return; // 선택된 권역과 무관한 이동은 제외
      }

      // 선택된 권역 내부는 상세 지역명 유지, 외부는 권역명으로 변환
      if (!isSourceInGroup) source = sourceGroup;
      if (!isTargetInGroup) target = targetGroup;
    }

    // 같은 지역/권역 내 이동 제외 (선택된 권역 내부의 구 간 이동은 허용)
    if (source === target) return;

    const key = `${source}|${target}`;
    const currentWeight = groupLinksMap.get(key) || 0;
    groupLinksMap.set(key, currentWeight + link.weight);
  });

  // 2. 노드 데이터 생성
  // 링크에 등장하는 모든 지역을 노드로 등록
  const uniqueRegions = new Set<string>();
  groupLinksMap.forEach((_, key) => {
    const [source, target] = key.split('|');
    uniqueRegions.add(source);
    uniqueRegions.add(target);
  });

  uniqueRegions.forEach(g => {
    groupNodesMap.set(g, { sum: 0, net: 0 });
  });

  groupLinksMap.forEach((weight, key) => {
    const [source, target] = key.split('|');
    
    const sourceNode = groupNodesMap.get(source);
    if (sourceNode) {
      sourceNode.net -= weight;
      sourceNode.sum += weight;
    }

    const targetNode = groupNodesMap.get(target);
    if (targetNode) {
      targetNode.net += weight;
      targetNode.sum += weight;
    }
  });

  // 3. 결과 포맷팅
  const allLinks = Array.from(groupLinksMap.entries()).map(([key, weight]) => {
    const [from, to] = key.split('|');
    return { from, to, weight };
  });

  // 미미한 이동 필터링 제거 (모든 이동 표시)
  const filteredLinks = allLinks.filter(link => link.weight > 0);

  // 색상 결정 함수
  const getNodeColor = (id: string) => {
    // 1. 권역 색상 (GROUP_COLORS에 정의된 경우)
    if (GROUP_COLORS[id]) return GROUP_COLORS[id];
    
    // 2. 서울 구 단위 (파란색 계열)
    // REGION_GROUPS를 통해 역추적하거나, id 패턴으로 확인
    const group = REGION_GROUPS[id];
    if (group === '서울') return '#93C5FD'; // Blue 300
    if (id.endsWith('구')) return '#93C5FD';

    // 3. 기타 상세 지역
    return '#E2E2E2';
  };

  // 노드 생성
  const nodes = Array.from(groupNodesMap.entries())
    .map(([id, stats]) => ({
      id,
      title: id,
      name: id,
      color: getNodeColor(id),
      dataLabels: {
          enabled: true,
          format: '{point.name}',
          style: {
            textOutline: 'none',
            color: '#333',
            fontSize: '15px',
            fontWeight: 'bold'
          }
      },
      ...stats
    }));

  return { nodes, links: filteredLinks };
};
