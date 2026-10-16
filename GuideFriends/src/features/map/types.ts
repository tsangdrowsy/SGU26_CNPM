// src/features/map/types.ts

import { POI } from "../../data/mockPois";

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface MapCanvasProps {
  pois: POI[];
  center: { latitude: number; longitude: number };
  userLocation: UserLocation | null;
  onReady?: () => void;
  onPoiSelected?: (poi: POI) => void;
  onMapTap?: () => void;
}