declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        Map: any;
        LatLng: any;
        Marker: any;
        InfoWindow: any;
        CustomOverlay: any;
        Circle: any;
        event: {
          addListener: (target: any, event: string, callback: () => void) => void;
        };
        services: {
          Geocoder: any;
          Status: {
            OK: string;
            ZERO_RESULT: string;
            ERROR: string;
          };
        };
      };
    };
  }
}

export {};
