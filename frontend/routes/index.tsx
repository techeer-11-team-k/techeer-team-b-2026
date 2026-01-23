import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Dashboard } from '../components/views/Dashboard';
import { MapExplorer } from '../components/views/MapExplorer';
import { Comparison } from '../components/views/Comparison';
import { HousingDemand } from '../components/views/HousingDemand';
import { HousingSupply } from '../components/views/HousingSupply';
import { PropertyDetail } from '../components/views/PropertyDetail';
import { Ranking } from '../components/views/Ranking';
import { PortfolioList } from '../components/PortfolioList';

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

  const handlePropertyClick = (id: string) => {
    navigate(`/property/${id}`);
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
  const navigate = useNavigate();

  const handlePropertyClick = (id: string) => {
    navigate(`/property/${id}`);
  };

  const handleViewAllPortfolio = () => {
    navigate('/portfolio');
  };

  return (
    <Layout 
      currentView="dashboard" 
      onChangeView={() => {}}
      isDetailOpen={false}
      isDockVisible={isDockVisible}
    >
      <Dashboard onPropertyClick={handlePropertyClick} onViewAllPortfolio={handleViewAllPortfolio} />
    </Layout>
  );
};

// 지도 페이지
const MapPage = () => {
  const [isDockVisible, setIsDockVisible] = useState(true);
  const navigate = useNavigate();

  const handlePropertyClick = (id: string) => {
    navigate(`/property/${id}`);
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

  const handlePropertyClick = (id: string) => {
    navigate(`/property/${id}`);
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

export const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/map" element={<MapPage />} />
    <Route path="/compare" element={<ComparePage />} />
    <Route path="/portfolio" element={<PortfolioPage />} />
    <Route path="/stats/demand" element={<HousingDemandPage />} />
    <Route path="/stats/supply" element={<HousingSupplyPage />} />
    <Route path="/stats/ranking" element={<RankingPage />} />
    <Route path="/stats" element={<Navigate to="/stats/demand" replace />} />
    <Route path="/property/:id" element={<AptDetailPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
