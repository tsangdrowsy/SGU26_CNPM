import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Store, Image as ImageIcon, CheckCircle, KeyRound, PlusCircle } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE = "http://localhost:3000";

function LocationMarker({ position, setPosition }) {
  useMapEvents({ click(e) { setPosition(e.latlng); } });
  return position === null ? null : <Marker position={position}></Marker>;
}

export default function ShopkeeperPage() {
  const navigate = useNavigate();
  const [view, setView] = useState("login"); // Chỉ còn "login" và "register"
  
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState(null);
  
  const [claimCode, setClaimCode] = useState("");
  const [formData, setFormData] = useState({ 
    poiId: "", name: "", descriptionVi: "", openingHours: "08:00 - 21:00", phone: "", paymentMethod: "vnpay" 
  });
  
  const [startHour, setStartHour] = useState("08");
  const [endHour, setEndHour] = useState("21");
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

  const [position, setPosition] = useState({ lat: 16.12345, lng: 108.23456 });
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/pois`).then(res => {
      setPois(res.data.pois);
      if (res.data.pois.length > 0) setFormData(prev => ({ ...prev, poiId: res.data.pois[0].id }));
    });
  }, []);

  // Khi bấm nút Vào Chỉnh Sửa -> Chuyển hướng sang trang Edit
  const handleVerify = () => {
    if (!claimCode.trim()) {
      setError("Vui lòng nhập mã.");
      return;
    }
    navigate(`/shopkeeper/edit/${claimCode.trim().toUpperCase()}`);
  };

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
      
      if (formData.paymentMethod === "vnpay") {
        const tempVnpayRef = res.data.tempVnpayRef; 
        const payRes = await axios.post(`${API_BASE}/api/payment/create-shop-vnpay`, { tempVnpayRef });
        window.location.href = payRes.data.paymentUrl; 
      } else {
        setSuccessData({ message: "Vui lòng đến quầy để thanh toán. Admin sẽ duyệt và cấp mã cho bạn." });
      }
    } catch (err) {
      setError(err.response?.data?.error || "Lỗi khi đăng ký.");
    } finally {
      setLoading(false);
    }
  };

  if (successData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Đã ghi nhận thông tin!</h2>
          <p className="text-gray-600 mb-6">{successData.message}</p>
          <button onClick={() => window.location.reload()} className="text-blue-500 hover:underline">
            Quay lại trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
        
        <div className="text-center mb-8 relative">
          {view === "register" && (
            <button onClick={() => setView("login")} className="absolute left-0 top-2 text-gray-500 hover:text-orange-500">
              <PlusCircle size={24} className="rotate-45" />
            </button>
          )}
          <Store className="mx-auto text-orange-500 mb-2" size={48} />
          <h1 className="text-2xl font-bold text-gray-800">
            {view === "login" ? "Cổng Thông Tin Chủ Quán" : "Đăng Ký Cửa Hàng Mới"}
          </h1>
        </div>

        {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-6 text-center">{error}</div>}

        {view === "login" && (
          <div className="max-w-sm mx-auto space-y-6 mt-8">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-center">
              <KeyRound className="mx-auto text-blue-500 mb-2" size={32} />
              <p className="text-sm text-blue-800 mb-4">Nhập mã Claim Code để chỉnh sửa thông tin quán của bạn.</p>
              <input
                type="text"
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                placeholder="VD: CLAIM-A1B2"
                className="w-full border-2 border-blue-300 p-3 rounded-lg text-center font-mono text-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none mb-3"
              />
              <button
                onClick={handleVerify}
                disabled={!claimCode}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                Vào Chỉnh Sửa
              </button>
            </div>

            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink-0 mx-4 text-gray-400">Hoặc</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <button
              onClick={() => setView("register")}
              className="w-full flex items-center justify-center gap-2 bg-orange-50 text-orange-600 border border-orange-200 font-bold py-3 rounded-lg hover:bg-orange-100 transition"
            >
              <PlusCircle size={20} /> Đăng Ký Quán Mới
            </button>
          </div>
        )}

        {view === "register" && (
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Chọn địa điểm gần quán nhất</label>
                  <select value={formData.poiId} onChange={(e) => setFormData({...formData, poiId: e.target.value})} className="w-full border p-3 rounded-lg bg-white">
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
                  <label className="block text-sm font-medium mb-1">Giờ mở cửa</label>
                  <div className="flex items-center gap-2">
                    <select value={startHour} onChange={(e) => {
                        setStartHour(e.target.value);
                        setFormData({...formData, openingHours: `${e.target.value}:00 - ${endHour}:00`});
                      }} className="border p-3 rounded-lg bg-white w-full">
                      {hours.map(h => <option key={`start-${h}`} value={h}>{h}:00</option>)}
                    </select>
                    <span className="text-gray-500 font-bold">đến</span>
                    <select value={endHour} onChange={(e) => {
                        setEndHour(e.target.value);
                        setFormData({...formData, openingHours: `${startHour}:00 - ${e.target.value}:00`});
                      }} className="border p-3 rounded-lg bg-white w-full">
                      {hours.map(h => <option key={`end-${h}`} value={h}>{h}:00</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Số điện thoại</label>
                  <input value={formData.phone} onChange={(e) => {
                      const onlyNums = e.target.value.replace(/\D/g, '');
                      setFormData({...formData, phone: onlyNums});
                    }} placeholder="0905..." className="w-full border p-3 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                    <ImageIcon size={16} /> Ảnh quán
                  </label>
                  <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} className="w-full border p-2 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hình thức thanh toán</label>
                  <select value={formData.paymentMethod} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})} className="w-full border p-3 rounded-lg bg-orange-50 font-bold text-orange-700">
                    <option value="vnpay">Chuyển khoản VNPAY</option>
                    <option value="cash">Tiền mặt tại quầy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Chọn vị trí quán trên bản đồ</label>
                <div className="h-[350px] w-full rounded-xl overflow-hidden border z-0">
                  <MapContainer center={[position.lat, position.lng]} zoom={16} style={{ height: "100%", width: "100%" }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <LocationMarker position={position} setPosition={setPosition} />
                  </MapContainer>
                </div>
                <p className="text-xs text-gray-500 mt-2">Tọa độ: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p>
              </div>
            </div>

            <button disabled={loading} type="submit" className="w-full bg-orange-500 text-white font-bold py-3 rounded-lg hover:bg-orange-600 transition mt-4">
  {loading ? "Đang xử lý..." : "Đăng Ký & Thanh Toán"}
</button>
          </form>
        )}
      </div>
    </div>
  );
}