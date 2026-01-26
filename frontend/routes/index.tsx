import React, { useState, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layout } from '../components/Layout';
import { Dashboard } from '../components/views/Dashboard';
import { MapExplorer } from '../components/views/MapExplorer';
import { Comparison } from '../components/views/Comparison';
import { HousingDemand } from '../components/views/HousingDemand';
import { HousingSupply } from '../components/views/HousingSupply';
import { PropertyDetail } from '../components/views/PropertyDetail';
import { Ranking } from '../components/views/Ranking';
import { PortfolioList } from '../components/PortfolioList';
import GovernmentPolicy from '../components/views/GovernmentPolicy';
import type { PropertyClickOptions } from '../types';

// 주택 수요 페이지
const HousingDemandPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);

  return (
    <Layout 
      currentView="stats" 
      onChangeView={() => {}}
      onStatsCategoryChange={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <HousingDemand />
    </Layout>
  );
};

// 주택 공급 페이지
const HousingSupplyPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);

  return (
    <Layout 
      currentView="stats" 
      onChangeView={() => {}}
      onStatsCategoryChange={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <HousingSupply />
    </Layout>
  );
};

// 주택 랭킹 페이지
const RankingPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);
  const navigate = useNavigate();

  const handlePropertyClick = (id: string, options?: PropertyClickOptions) => {
    const search = options?.edit ? '?edit=1' : '';
    navigate(`/property/${id}${search}`);
  };

  return (
    <Layout 
      currentView="stats" 
      onChangeView={() => {}}
      onStatsCategoryChange={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <Ranking onPropertyClick={handlePropertyClick} />
    </Layout>
  );
};

// 아파트 상세 페이지
const AptDetailPage = () => {
  const navigate = useNavigate();
  const [isDockVisible, setIsDockVisible] = useState(true);
  
  const handleBack = () => {
    // "홈으로"가 아니라 직전 화면으로 복귀
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };
  
  return (
    <Layout 
      currentView="dashboard" 
      onChangeView={() => {}}
      isDetailOpen={true}
      isDockVisible={isDockVisible}
    >
      <PropertyDetail onBack={handleBack} isCompact={false} />
    </Layout>
  );
};

// 홈 페이지
const HomePage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);
  const handleSettingsClickRef = useRef<(() => void) | null>(null);
  const navigate = useNavigate();

  const handlePropertyClick = (id: string, options?: PropertyClickOptions) => {
    const search = options?.edit ? '?edit=1' : '';
    navigate(`/property/${id}${search}`);
  };

  const handleViewAllPortfolio = () => {
    navigate('/portfolio');
  };

  const handleSettingsClick = () => {
    if (handleSettingsClickRef.current) {
      handleSettingsClickRef.current();
    }
  };

  return (
    <Layout 
      currentView="dashboard" 
      onChangeView={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
      onSettingsClick={handleSettingsClick}
    >
      <Dashboard 
        onPropertyClick={handlePropertyClick} 
        onViewAllPortfolio={handleViewAllPortfolio}
        onSettingsClickRef={(handler) => {
          handleSettingsClickRef.current = handler;
        }}
      />
    </Layout>
  );
};

// 지도 페이지
const MapPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);
  const navigate = useNavigate();

  const handlePropertyClick = (id: string, options?: PropertyClickOptions) => {
    const search = options?.edit ? '?edit=1' : '';
    navigate(`/property/${id}${search}`);
  };

  const handleMapDockToggle = (forceState?: boolean) => {
    if (typeof forceState === 'boolean') {
      setIsDockVisible(forceState);
    } else {
      setIsDockVisible(prev => !prev);
    }
  };

  return (
    <Layout 
      currentView="map" 
      onChangeView={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <MapExplorer onPropertyClick={handlePropertyClick} onToggleDock={handleMapDockToggle} />
    </Layout>
  );
};

// 비교 페이지
const ComparePage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);

  return (
    <Layout 
      currentView="compare" 
      onChangeView={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <Comparison />
    </Layout>
  );
};

// 포트폴리오 페이지
const PortfolioPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);
  const navigate = useNavigate();

  const handlePropertyClick = (id: string, options?: PropertyClickOptions) => {
    const search = options?.edit ? '?edit=1' : '';
    navigate(`/property/${id}${search}`);
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <Layout 
      currentView="dashboard" 
      onChangeView={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <PortfolioList onPropertyClick={handlePropertyClick} onBack={handleBack} />
    </Layout>
  );
};

// 정부정책 페이지
const GovernmentPolicyPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);

  return (
    <Layout 
      currentView="stats" 
      onChangeView={() => {}}
      onStatsCategoryChange={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <GovernmentPolicy />
    </Layout>
  );
};

export const AppRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/stats/demand" element={<HousingDemandPage />} />
        <Route path="/stats/supply" element={<HousingSupplyPage />} />
        <Route path="/stats/ranking" element={<RankingPage />} />
        <Route path="/stats" element={<Navigate to="/stats/demand" replace />} />
        <Route path="/policy" element={<GovernmentPolicyPage />} />
        <Route path="/property/:id" element={<AptDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
};