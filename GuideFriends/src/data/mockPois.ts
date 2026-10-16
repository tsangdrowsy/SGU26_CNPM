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

// =====================================================
// TEST WORLD: Saigon University (dense OSM coverage)
// Real target (swap back for final demo if needed):
//   Linh Ung Pagoda, Son Tra, Da Nang
//   { latitude: 16.12345, longitude: 108.23456 }
// =====================================================

export const MAP_CENTER = {
  latitude: 10.75247,
  longitude: 106.6651,
};

export const MOCK_POIS: POI[] = [
  {
    id: "poi_001",
    name: "Cổng Chính (Main Gate)",
    shortDescription:
      "Cổng chính trường Đại học Sài Gòn, mặt tiền An Dương Vương.",
    fullDescription:
      "Cổng chính là điểm đón tiếp sinh viên và khách tham quan. Từ đây có thể nhìn thấy tòa hiệu bộ và quảng trường trung tâm.",
    latitude: 10.75205,
    longitude: 106.6651,
    radiusMeters: 20,
  },
  {
    id: "poi_002",
    name: "Thư Viện (Library)",
    shortDescription: "Thư viện trung tâm với không gian học tập yên tĩnh.",
    fullDescription:
      "Thư viện Đại học Sài Gòn gồm nhiều tầng, lưu trữ hàng chục nghìn đầu sách và khu tự học mở cửa đến tối.",
    latitude: 10.75265,
    longitude: 106.66475,
    radiusMeters: 20,
  },
  {
    id: "poi_003",
    name: "Căn Tin (Canteen)",
    shortDescription: "Khu ẩm thực sôi động nhất khuôn viên trường.",
    fullDescription:
      "Căn tin phục vụ cơm, bún, cà phê với giá sinh viên. Giờ cao điểm từ 11h đến 13h mỗi ngày.",
    latitude: 10.7527,
    longitude: 106.6656,
    radiusMeters: 20,
  },
  {
    id: "poi_004",
    name: "Giảng Đường A (Lecture Hall A)",
    shortDescription: "Tòa giảng đường lớn nhất của trường.",
    fullDescription:
      "Giảng đường A gồm hơn 40 phòng học và hội trường lớn, nơi diễn ra các sự kiện học thuật quan trọng.",
    latitude: 10.7532,
    longitude: 106.6652,
    radiusMeters: 20,
  },
];