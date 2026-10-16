// src/data/mockPois.ts

export interface POI {
  id: string;
  name: string;
  shortDescription: string;
  fullDescription?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export const MAP_CENTER = {
  latitude: 16.12345,
  longitude: 108.23456,
};

export const MOCK_POIS: POI[] = [
  {
    id: "poi_001",
    name: "Entrance Gate",
    shortDescription: "Main entrance to Linh Ung Pagoda.",
    fullDescription:
      "This is the main entrance gate where visitors begin their tour of Linh Ung Pagoda.",
    latitude: 16.12305,
    longitude: 108.2341,
    radiusMeters: 20,
  },
  {
    id: "poi_002",
    name: "Tam Bao Main Hall",
    shortDescription: "The main worship hall of the pagoda.",
    fullDescription:
      "Tam Bao is the main hall of Linh Ung Pagoda, where visitors pray and enjoy the spiritual atmosphere.",
    latitude: 16.12345,
    longitude: 108.23456,
    radiusMeters: 20,
  },
  {
    id: "poi_003",
    name: "Guan Yin Statue",
    shortDescription: "Tall white Buddha statue facing the sea.",
    fullDescription:
      "The Guan Yin statue is one of the most famous landmarks at Linh Ung Pagoda.",
    latitude: 16.12385,
    longitude: 108.2349,
    radiusMeters: 20,
  },
];