// src/features/map/types.ts

// Fix: Import POI từ đúng file types, không phải từ file mock data
import { POI } from "../../types/poi";

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