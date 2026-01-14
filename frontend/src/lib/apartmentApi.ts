import apiClient from './api';

export interface ApartmentDetailData {
  apt_detail_id: number;
  apt_id: number;
  road_address: string;
  jibun_address: string;
  zip_code: string | null;
  code_sale_nm: string | null;
  code_heat_nm: string | null;
  total_household_cnt: number;
  total_building_cnt: number | null;
  highest_floor: number | null;
  use_approval_date: string | null;
  total_parking_cnt: number | null;
  builder_name: string | null;
  developer_name: string | null;
  manage_type: string | null;
  hallway_type: string | null;
  subway_time: string | null;
  subway_line: string | null;
  subway_station: string | null;
  educationFacility: string | null;
}

/**
 * 아파트 상세 정보를 조회합니다.
 * @param aptId 아파트 ID
 */
export const getApartmentDetail = async (aptId: number): Promise<ApartmentDetailData | null> => {
  try {
    const response = await apiClient.get<ApartmentDetailData>(`/apartments/${aptId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch apartment detail:', error);
    return null;
  }
};
