// src/types/poi.ts

export type LanguageCode = "vi" | "en" | "zh" | "ko" | "ja";

export interface Shopkeeper {
  id: string;
  name: string;
  descriptionVi: string;
  imageUrl?: string;
  openingHours?: string;
  phone?: string;
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
  imageUrl?: string;
  shopkeepers?: Shopkeeper[];
}