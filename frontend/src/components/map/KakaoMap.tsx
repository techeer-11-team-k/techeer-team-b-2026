import React, { useEffect, useRef, useState } from 'react';
import { useKakaoLoader } from '../../hooks/useKakaoLoader';
import { useGeolocation } from '../../hooks/useGeolocation';

interface KakaoMapProps {
  onMapLoad?: (map: any) => void;
  className?: string;
  center?: { lat: number; lng: number };
  level?: number;
  apartments?: any[];
  onMarkerClick?: (apt: any) => void;
  showCurrentLocation?: boolean;
  currentLocation?: { lat: number; lng: number } | null;
  onCenterChange?: (center: { lat: number; lng: number }) => void;
  isRoadviewMode?: boolean;
  isDarkMode?: boolean;
}

export default function KakaoMap({ 
  onMapLoad, 
  className = "w-full h-full", 
  center = { lat: 37.5665, lng: 126.9780 }, // Seoul City Hall
  level = 3,
  apartments = [],
  onMarkerClick,
  showCurrentLocation = true,
  currentLocation: externalCurrentLocation,
  onCenterChange,
  isRoadviewMode = false,
  isDarkMode = false
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const roadviewContainerRef = useRef<HTMLDivElement>(null);
  const { isLoaded, error } = useKakaoLoader();
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [roadviewInstance, setRoadviewInstance] = useState<any>(null);
  const [roadviewClient, setRoadviewClient] = useState<any>(null);
  const [showRoadview, setShowRoadview] = useState(false);
  const markersRef = useRef<Array<{ marker: any; infoWindow: any; labelOverlay: any }>>([]);
  const currentLocationMarkerRef = useRef<any>(null);
  const currentLocationCircleRef = useRef<any>(null);
  const roadviewMarkerRef = useRef<any>(null);
  const roadviewLabelRef = useRef<any>(null);
  const { position: currentPosition, getCurrentPosition, requestPermission } = useGeolocation(false);
  
  // 외부에서 전달된 위치 또는 내부에서 가져온 위치 사용
  const displayLocation = externalCurrentLocation || currentPosition;

  useEffect(() => {
    if (isLoaded && containerRef.current && !mapInstance) {
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level: level,
      };
      const map = new window.kakao.maps.Map(containerRef.current, options);
      
      // 레이아웃 강제 재조정 (지도가 깨지는 현상 방지)
      setTimeout(() => {
        map.relayout();
      }, 100);

      setMapInstance(map);
      
      if (onMapLoad) {
        onMapLoad(map);
      }
    }
  }, [isLoaded, containerRef, mapInstance, onMapLoad, center, level]);

  // Update center
  useEffect(() => {
    if (mapInstance && center) {
      const moveLatLon = new window.kakao.maps.LatLng(center.lat, center.lng);
      mapInstance.panTo(moveLatLon);
    }
  }, [center, mapInstance]);

  // 현재 위치 가져오기 (외부에서 전달되지 않은 경우에만)
  useEffect(() => {
    if (showCurrentLocation && mapInstance && !externalCurrentLocation) {
      const fetchLocation = async () => {
        const hasPermission = await requestPermission();
        if (hasPermission) {
          await getCurrentPosition();
        }
      };
      fetchLocation();
    }
  }, [showCurrentLocation, mapInstance, externalCurrentLocation, requestPermission, getCurrentPosition]);

  // 현재 위치 마커 표시
  useEffect(() => {
    if (mapInstance && displayLocation && showCurrentLocation) {
      // 기존 현재 위치 마커 및 원 제거
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
        currentLocationMarkerRef.current = null;
      }
      if (currentLocationCircleRef.current) {
        currentLocationCircleRef.current.setMap(null);
        currentLocationCircleRef.current = null;
      }

      const location = new window.kakao.maps.LatLng(displayLocation.lat, displayLocation.lng);
      
      // 현재 위치 원형 영역 표시
      const circleMarker = new window.kakao.maps.Circle({
        center: location,
        radius: 50, // 미터 단위
        strokeWeight: 3,
        strokeColor: '#4285F4',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
        fillColor: '#4285F4',
        fillOpacity: 0.2
      });
      circleMarker.setMap(mapInstance);
      currentLocationCircleRef.current = circleMarker;

      // 현재 위치 중심 마커 (파란색 원) - 커스텀 오버레이 사용
      const markerContent = document.createElement('div');
      markerContent.style.width = '24px';
      markerContent.style.height = '24px';
      markerContent.style.borderRadius = '50%';
      markerContent.style.backgroundColor = '#4285F4';
      markerContent.style.border = '3px solid #FFFFFF';
      markerContent.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
      markerContent.style.cursor = 'default';
      
      const marker = new window.kakao.maps.CustomOverlay({
        position: location,
        content: markerContent,
        yAnchor: 0.5,
        xAnchor: 0.5
      });
      
      marker.setMap(mapInstance);
      currentLocationMarkerRef.current = marker;
    } else if (mapInstance && !displayLocation && showCurrentLocation) {
      // 위치가 없으면 마커 제거
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setMap(null);
        currentLocationMarkerRef.current = null;
      }
      if (currentLocationCircleRef.current) {
        currentLocationCircleRef.current.setMap(null);
        currentLocationCircleRef.current = null;
      }
    }
  }, [mapInstance, displayLocation, showCurrentLocation]);

  // 거리뷰 마커 업데이트 함수
  const updateRoadviewMarker = (roadview: any, lat: number, lng: number, aptName: string) => {
    try {
      const position = new window.kakao.maps.LatLng(lat, lng);
      
      // 기존 마커 제거
      if (roadviewMarkerRef.current) {
        roadviewMarkerRef.current.setMap(null);
      }
      
      // 거리뷰에 마커 표시
      const rMarker = new window.kakao.maps.Marker({
        position: position,
        map: roadview
      });
      roadviewMarkerRef.current = rMarker;
      
      // 기존 인포윈도우 제거
      if (roadviewLabelRef.current) {
        roadviewLabelRef.current.close();
      }
      
      // 거리뷰에 인포윈도우 표시
      const rLabel = new window.kakao.maps.InfoWindow({
        position: position,
        content: aptName
      });
      rLabel.open(roadview, rMarker);
      roadviewLabelRef.current = rLabel;
      
          // 마커가 중앙에 오도록 viewpoint 조정
          try {
            const projection = roadview.getProjection();
            const viewpoint = projection.viewpointFromCoords(rMarker.getPosition(), rMarker.getAltitude());
            roadview.setViewpoint(viewpoint);
          } catch (e) {
            // viewpoint 조정 실패 시 무시
          }
    } catch (error) {
      // 거리뷰 마커 업데이트 실패 시 무시
    }
  };

  // 거리뷰 표시 함수
  const showRoadviewAtLocation = (lat: number, lng: number, aptName: string) => {
    if (!isLoaded || !window.kakao || !window.kakao.maps) return;
    
    try {
      // 먼저 거리뷰를 표시하여 컨테이너가 DOM에 렌더링되도록 함
      setShowRoadview(true);
      
      // 거리뷰 컨테이너가 DOM에 추가될 때까지 대기
      const waitForContainer = (retries = 20) => {
        const roadviewDiv = document.getElementById('roadview-container') as HTMLDivElement;
        
        if ((!roadviewDiv || roadviewDiv.offsetWidth === 0 || roadviewDiv.offsetHeight === 0) && retries > 0) {
          setTimeout(() => waitForContainer(retries - 1), 100);
          return;
        }
        
        if (!roadviewDiv || roadviewDiv.offsetWidth === 0 || roadviewDiv.offsetHeight === 0) {
          setShowRoadview(false);
          return;
        }
        
        // 거리뷰 객체가 없으면 생성
        // DOM 요소가 새로 생성되었으므로 항상 새로운 인스턴스를 생성해야 함
        // (이전 인스턴스는 이미 제거된 DOM 요소에 연결되어 있음)
        let roadview = null;
        let client = null;
        
        // 항상 새로운 인스턴스 생성 (DOM 요소가 재생성되었기 때문)
        roadview = new window.kakao.maps.Roadview(roadviewDiv);
        client = new window.kakao.maps.RoadviewClient();
        setRoadviewInstance(roadview);
        setRoadviewClient(client);
        
        // 거리뷰 표시
        const position = new window.kakao.maps.LatLng(lat, lng);
        const clientToUse = client || new window.kakao.maps.RoadviewClient();
        
        // 거리뷰 가능 지역 찾기 (점진적으로 범위 확대)
        const findNearestRoadview = (radius: number, maxRadius: number = 1000) => {
          clientToUse.getNearestPanoId(position, radius, (panoId: number) => {
            // panoId가 null이거나 0 이하인 경우 유효하지 않은 값으로 처리
            if (!panoId || panoId === null || panoId <= 0) {
              // 더 넓은 범위로 재시도
              if (radius < maxRadius) {
                findNearestRoadview(Math.min(radius * 2, maxRadius), maxRadius);
              } else {
                // 최대 범위까지 찾았지만 없음
                setShowRoadview(false);
                alert('이 위치 근처에서 거리뷰를 사용할 수 없습니다.');
              }
              return;
            }
            
            // panoId를 찾았으면 거리뷰 표시
            if (roadview) {
              try {
                // 거리뷰 초기화 이벤트 리스너 등록 (매번 등록하여 확실하게 처리)
                const initListener = () => {
                  // 거리뷰가 초기화되면 마커 업데이트
                  updateRoadviewMarker(roadview, lat, lng, aptName);
                  window.kakao.maps.event.removeListener(roadview, 'init', initListener);
                };
                
                window.kakao.maps.event.addListener(roadview, 'init', initListener);
                
                // panoId 설정 - 유효한 값인지 다시 한번 확인
                if (panoId && panoId > 0) {
                  roadview.setPanoId(panoId, position);
                } else {
                  // 유효하지 않은 panoId인 경우 재시도
                  if (radius < maxRadius) {
                    findNearestRoadview(Math.min(radius * 2, maxRadius), maxRadius);
                  } else {
                    setShowRoadview(false);
                    alert('이 위치 근처에서 거리뷰를 사용할 수 없습니다.');
                  }
                  return;
                }
                
                // 거리뷰가 로드될 때까지 대기 후 마커 업데이트
                const checkRoadviewLoaded = (attempts = 0) => {
                  if (attempts > 30) {
                    // 최대 3초 대기 후에도 안 되면 마커만 표시
                    updateRoadviewMarker(roadview, lat, lng, aptName);
                    return;
                  }
                  
                  try {
                    if (roadview.getProjection) {
                      // 거리뷰가 초기화되었으면 마커 업데이트
                      updateRoadviewMarker(roadview, lat, lng, aptName);
                    } else {
                      setTimeout(() => checkRoadviewLoaded(attempts + 1), 100);
                    }
                  } catch (e) {
                    setTimeout(() => checkRoadviewLoaded(attempts + 1), 100);
                  }
                };
                
                // 거리뷰 초기화 확인
                setTimeout(() => checkRoadviewLoaded(), 500);
              } catch (e) {
                // 거리뷰 설정 실패
                setShowRoadview(false);
              }
            }
          });
        };
        
        // 50m부터 시작하여 점진적으로 범위 확대
        findNearestRoadview(50, 1000);
      };
      
      waitForContainer();
    } catch (error) {
      // 거리뷰 표시 실패 시 숨김
      setShowRoadview(false);
    }
  };

  // Render Markers - Disabled (아파트 마커는 표시하지 않음)
  // 현재 위치 마커와 거리뷰 기능만 사용
  useEffect(() => {
    if (!mapInstance || !isLoaded || !window.kakao || !window.kakao.maps) return;

    // 기존 마커 제거
    markersRef.current.forEach((item: any) => {
      if (item.marker) item.marker.setMap(null);
      if (item.infoWindow) item.infoWindow.close();
      if (item.labelOverlay) item.labelOverlay.setMap(null);
    });
    markersRef.current = [];

    // 지도 중심 이동은 제거 - 사용자가 검색 결과를 선택하거나 수동으로 이동할 때만 이동
    // 자동 이동은 검색 결과 변경 시마다 발생하여 지도를 수동으로 조작할 수 없게 만듦

    apartments.forEach((apt, index) => {
        if (!apt.lat || !apt.lng) {
          return;
        }

        try {
          const markerPosition = new window.kakao.maps.LatLng(apt.lat, apt.lng);
          
          // 마커 타입에 따라 다른 마커 이미지 사용
          const markerType = apt.markerType || 'apartment';
          let marker;
          
          if (markerType === 'location') {
            // 지역 마커: 빨간색 마커 이미지 사용
            const imageSrc = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png';
            const imageSize = new window.kakao.maps.Size(64, 69);
            const imageOption = { offset: new window.kakao.maps.Point(27, 69) };
            const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize, imageOption);
            
            marker = new window.kakao.maps.Marker({
              position: markerPosition,
              image: markerImage,
              clickable: true
            });
          } else {
            // 아파트 마커: 기본 마커 사용
            marker = new window.kakao.maps.Marker({
              position: markerPosition,
              clickable: true
            });
          }

          marker.setMap(mapInstance);
          
          // 이름 정보 (아파트 또는 지역)
          const aptName = apt.name || apt.apt_name || '이름 없음';
          const aptAddress = apt.address || apt.location || '';
          const aptPrice = apt.price || '';
          const aptId = apt.apt_id || apt.id;
          const isLocation = markerType === 'location';
          
          // onMarkerClick에 전달할 객체에 apt_id 명시적으로 포함
          const aptDataForClick = {
            ...apt,
            apt_id: aptId,
            id: aptId,
            name: aptName,
            apt_name: aptName,
            address: aptAddress,
            location: aptAddress,
            price: aptPrice,
            lat: apt.lat,
            lng: apt.lng
          };
          
          // 마커 위에 아파트명 표시하는 커스텀 오버레이 (라벨)
          const labelContent = document.createElement('div');
          labelContent.style.cssText = `
            padding: 4px 8px;
            background-color: rgba(255, 255, 255, 0.95);
            border: 1px solid #0ea5e9;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            color: #0ea5e9;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            pointer-events: auto;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
          `;
          labelContent.textContent = aptName;
          
          // 라벨 클릭 시에도 상세 페이지로 이동
          labelContent.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onMarkerClick) {
              onMarkerClick(aptDataForClick);
            }
          });
          
          const labelOverlay = new window.kakao.maps.CustomOverlay({
            position: markerPosition,
            content: labelContent,
            yAnchor: 2.2, // 마커 위에 표시
            xAnchor: 0.5,
            zIndex: 10
          });
          
          labelOverlay.setMap(mapInstance);
          
          // 인포윈도우 생성 (상세 페이지 링크 포함)
          // 인포윈도우 내용을 DOM 요소로 생성하여 이벤트 리스너 추가 가능하게 함
          const infoDiv = document.createElement('div');
          infoDiv.style.cssText = 'padding:12px;min-width:200px;';
          
          const nameDiv = document.createElement('div');
          nameDiv.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:4px;color:#333;';
          nameDiv.textContent = aptName;
          infoDiv.appendChild(nameDiv);
          
          if (aptAddress) {
            const addressDiv = document.createElement('div');
            addressDiv.style.cssText = 'font-size:12px;color:#666;margin-bottom:8px;';
            addressDiv.textContent = aptAddress;
            infoDiv.appendChild(addressDiv);
          }
          
          if (aptPrice) {
            const priceDiv = document.createElement('div');
            priceDiv.style.cssText = 'font-size:13px;color:#0ea5e9;font-weight:bold;margin-bottom:8px;';
            priceDiv.textContent = aptPrice;
            infoDiv.appendChild(priceDiv);
          }
          
          // 상세 정보 보기 버튼 (아파트인 경우에만)
          if (!isLocation) {
            const detailButton = document.createElement('div');
            detailButton.style.cssText = 'color:#0ea5e9;text-decoration:none;font-size:13px;font-weight:bold;display:block;padding:6px 12px;background:#f0f9ff;border-radius:4px;margin-top:8px;text-align:center;cursor:pointer;';
            detailButton.textContent = '상세 정보 보기';
            detailButton.addEventListener('click', (e) => {
              e.stopPropagation();
              if (onMarkerClick) {
                onMarkerClick(aptDataForClick);
              }
            });
            infoDiv.appendChild(detailButton);
          }
          
          // 링크 컨테이너
          const linksDiv = document.createElement('div');
          linksDiv.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
          
          const mapLink = document.createElement('a');
          mapLink.href = `https://map.kakao.com/link/map/${encodeURIComponent(aptName)},${apt.lat},${apt.lng}`;
          mapLink.target = '_blank';
          mapLink.style.cssText = 'color:#0ea5e9;text-decoration:none;font-size:12px;';
          mapLink.textContent = '큰지도보기';
          linksDiv.appendChild(mapLink);
          
          const routeLink = document.createElement('a');
          routeLink.href = `https://map.kakao.com/link/to/${encodeURIComponent(aptName)},${apt.lat},${apt.lng}`;
          routeLink.target = '_blank';
          routeLink.style.cssText = 'color:#0ea5e9;text-decoration:none;font-size:12px;';
          routeLink.textContent = '길찾기';
          linksDiv.appendChild(routeLink);
          
          infoDiv.appendChild(linksDiv);
          
          const infoWindow = new window.kakao.maps.InfoWindow({
            content: infoDiv,
            removable: true
          });

          // 마커 클릭 시 인포윈도우 표시 및 상세 페이지로 이동 (아파트인 경우에만)
          window.kakao.maps.event.addListener(marker, 'click', () => {
              // 거리뷰 모드이고 아파트인 경우 거리뷰 표시
              if (isRoadviewMode && !isLocation) {
                showRoadviewAtLocation(apt.lat, apt.lng, aptName);
                return;
              }
              
              // 거리뷰 모드가 아닐 때만 인포윈도우 및 상세 페이지 표시
              // 다른 인포윈도우 닫기
              markersRef.current.forEach((item: any) => {
                  if (item.infoWindow) item.infoWindow.close();
              });
              
              infoWindow.open(mapInstance, marker);
              
              // 아파트인 경우에만 상세 페이지로 이동
              if (!isLocation && onMarkerClick) {
                  onMarkerClick(aptDataForClick);
              }
          });

          markersRef.current.push({ marker, infoWindow, labelOverlay });
        } catch (error) {
          // 마커 생성 실패 시 무시하고 계속 진행
        }
      });
  }, [mapInstance, apartments, onMarkerClick, isRoadviewMode]);

  // 거리뷰 모드가 꺼지면 거리뷰 숨기기
  useEffect(() => {
    if (!isRoadviewMode && showRoadview) {
      // 거리뷰 마커 정리
      if (roadviewMarkerRef.current) {
        roadviewMarkerRef.current.setMap(null);
        roadviewMarkerRef.current = null;
      }
      if (roadviewLabelRef.current) {
        roadviewLabelRef.current.close();
        roadviewLabelRef.current = null;
      }
      
      // 거리뷰 인스턴스 정리 - DOM이 제거되면 기존 인스턴스는 사용할 수 없음
      setRoadviewInstance(null);
      setRoadviewClient(null);
      
      // 거리뷰 숨기기
      setShowRoadview(false);
    }
  }, [isRoadviewMode, showRoadview]);

  if (error) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-red-50 text-red-600 border-2 border-red-200 p-4 rounded-lg`} style={{ minHeight: '300px' }}>
        <p className="font-bold text-lg mb-2">❌ 지도를 불러오는데 실패했습니다.</p>
        <p className="text-sm">API 키 설정이나 네트워크 상태를 확인해주세요.</p>
        <p className="text-xs mt-4 text-gray-500 bg-gray-100 p-2 rounded">
           Tip: frontend/.env 파일에 VITE_KAKAO_JAVASCRIPT_KEY가 설정되어 있는지 확인하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div 
        ref={containerRef} 
        className={className} 
        id="map"
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '500px', 
          backgroundColor: '#f3f4f6',
          zIndex: showRoadview ? 0 : 'auto',
          position: 'relative'
        }}
      >
        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium">지도를 불러오는 중...</p>
          </div>
        )}
      </div>
      
      {/* 거리뷰 컨테이너 */}
      {showRoadview && (
        <div 
          className="absolute inset-0 bg-black" 
          style={{ 
            width: '100%', 
            height: '100%',
            zIndex: 1000,
            position: 'absolute',
            top: 0,
            left: 0
          }}
        >
          <div 
            ref={roadviewContainerRef}
            id="roadview-container"
            style={{ 
              width: '100%', 
              height: '100%', 
              position: 'absolute', 
              top: 0, 
              left: 0,
              zIndex: 1000
            }}
          />
          {/* 거리뷰 닫기 버튼 */}
          <button
            onClick={() => {
              // 거리뷰 마커 정리
              if (roadviewMarkerRef.current) {
                roadviewMarkerRef.current.setMap(null);
                roadviewMarkerRef.current = null;
              }
              if (roadviewLabelRef.current) {
                roadviewLabelRef.current.close();
                roadviewLabelRef.current = null;
              }
              
              // 거리뷰 인스턴스 정리 - DOM이 제거되면 기존 인스턴스는 사용할 수 없음
              setRoadviewInstance(null);
              setRoadviewClient(null);
              
              // 거리뷰 숨기기
              setShowRoadview(false);
            }}
            className={`fixed top-4 right-4 w-12 h-12 rounded-xl shadow-2xl border-2 flex items-center justify-center transition-all active:scale-95 hover:scale-105 ${
              isDarkMode
                ? 'bg-zinc-900 border-zinc-600 hover:bg-zinc-800 text-white'
                : 'bg-white border-zinc-300 hover:bg-gray-50 text-zinc-900'
            }`}
            style={{ zIndex: 1001 }}
            title="거리뷰 닫기"
          >
            <span className="text-2xl font-bold leading-none">×</span>
          </button>
        </div>
      )}
    </div>
  );
}
