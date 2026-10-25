import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Store, ImageIcon, CheckCircle } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css"; // 👈 Import CSS cho Map

const API_BASE = "http://localhost:3000";

// Component bắt sự kiện click trên bản đồ
function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return position === null ? null : <Marker position={position}></Marker>;
}

export default function ShopkeeperPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("register");
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState(null);
  
  const [formData, setFormData] = useState({ 
    poiId: "", name: "", descriptionVi: "", openingHours: "", phone: "", paymentMethod: "vnpay" 
  });
  const [position, setPosition] = useState({ lat: 16.12345, lng: 108.23456 }); // Tọa độ mặc định (Chùa Linh Ứng)
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/pois`).then(res => {
      setPois(res.data.pois);
      if (res.data.pois.length > 0) setFormData(prev => ({ ...prev, poiId: res.data.pois[0].id }));
    });
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const data = new FormData();
    Object.keys(formData).forEach(key => data.append(key, formData[key]));
    data.append("latitude", position.lat);
    data.append("longitude", position.lng);
    if (imageFile) data.append("image", imageFile);

    try {
      const res = await axios.post(`${API_BASE}/api/shopkeeper/register`, data);
      const shopId = res.data.shopId;

      if (formData.paymentMethod === "vnpay") {
        // Gọi API lấy link thanh toán VNPAY cho Shop
        const payRes = await axios.post(`${API_BASE}/api/payment/create-shop-vnpay`, { shopId });
        window.location.href = payRes.data.paymentUrl; // Chuyển hướng sang VNPAY
      } else {
        setSuccessData({ message: "Vui lòng đến quầy để thanh toán. Admin sẽ duyệt và cấp mã cho bạn." });
      }
    } catch (err) {
      setError(err.response?.data?.error || "Lỗi khi đăng ký.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl bg-white p-8 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-8">Đăng Ký Cửa Hàng</h1>
        
        {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-6">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* CỘT TRÁI: NHẬP THÔNG TIN */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Thuộc địa điểm nào?</label>
                <select value={formData.poiId} onChange={(e) => setFormData({...formData, poiId: e.target.value})} className="w-full border p-3 rounded-lg">
                  {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tên cửa hàng</label>
                <input required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border p-3 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mô tả</label>
                <textarea rows="2" value={formData.descriptionVi} onChange={(e) => setFormData({...formData, descriptionVi: e.target.value})} className="w-full border p-3 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hình thức thanh toán</label>
                <select value={formData.paymentMethod} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})} className="w-full border p-3 rounded-lg bg-orange-50 font-bold text-orange-700">
                  <option value="vnpay">Chuyển khoản VNPAY (Duyệt tự động)</option>
                  <option value="cash">Tiền mặt tại quầy (Chờ Admin duyệt)</option>
                </select>
              </div>
            </div>

            {/* CỘT PHẢI: CHỌN VỊ TRÍ BẢN ĐỒ */}
            <div>
              <label className="block text-sm font-medium mb-1">Chọn vị trí quán trên bản đồ (Click vào bản đồ)</label>
              <div className="h-[300px] w-full rounded-xl overflow-hidden border">
                <MapContainer center={[position.lat, position.lng]} zoom={16} style={{ height: "100%", width: "100%" }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <LocationMarker position={position} setPosition={setPosition} />
                </MapContainer>
              </div>
              <p className="text-xs text-gray-500 mt-2">Tọa độ: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p>
            </div>
          </div>

          <button disabled={loading} type="submit" className="w-full bg-orange-500 text-white font-bold py-3 rounded-lg mt-4">
            {loading ? "Đang xử lý..." : "Đăng Ký & Thanh Toán"}
          </button>
        </form>
      </div>
    </div>
  );
}