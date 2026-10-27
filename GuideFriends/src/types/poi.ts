// src/types/poi.ts

export type LanguageCode = "vi" | "en" | "zh" | "ko" | "ja";

export interface Shopkeeper {
  id: string;
  name: string;
  descriptionVi: string;
  imageUrls?: string[];
  openingHours?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
}

export interface POILocation {
  latitude: number;
  longitude: number;
}

export interface POI {
  id: string;
  name: string;
  shortDescriptionVi: string;
  fullDescriptionVi: string;
  location: POILocation;
  radiusMeters: number;
  imageUrls?: string[];
  shopkeepers?: Shopkeeper[];
}