import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { Store, Image as ImageIcon, CheckCircle, ArrowLeft, KeyRound, PlusCircle } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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
  const initialCode = searchParams.get("code") || "";
  
  // 3 trạng thái: "login" (nhập mã), "register" (đăng ký mới), "edit" (chỉnh sửa)
  const [view, setView] = useState("login");
  
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState(null);
  
  // State cho Form
  const [claimCode, setClaimCode] = useState(initialCode);
  const [formData, setFormData] = useState({ 
    poiId: "", name: "", descriptionVi: "", openingHours: "", phone: "", paymentMethod: "vnpay" 
  });
  const [position, setPosition] = useState({ lat: 16.12345, lng: 108.23456 }); // Mặc định Chùa Linh Ứng
  const [imageFile, setImageFile] = useState(null);

  // Lấy danh sách POIs
  useEffect(() => {
    axios.get(`${API_BASE}/api/pois`).then(res => {
      setPois(res.data.pois);
      if (res.data.pois.length > 0) setFormData(prev => ({ ...prev, poiId: res.data.pois[0].id }));
    });
  }, []);

  // Nếu có mã trên URL (Magic Link), tự động verify
  useEffect(() => {
    if (initialCode) {
      handleVerify(initialCode);
    }
  }, [initialCode]);

  // --- LUỒNG 2: KIỂM TRA MÃ ĐỂ SỬA ---
  const handleVerify = async (codeToVerify) => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/shopkeeper/verify/${codeToVerify}`);
      setFormData({
        poiId: res.data.shop.PoiId,
        name: res.data.shop.Name,
        descriptionVi: res.data.shop.DescriptionVi || "",
        openingHours: res.data.shop.OpeningHours || "",
        phone: res.data.shop.Phone || "",
      });
      setView("edit");
    } catch (err) {
      setError(err.response?.data?.error || "Mã không hợp lệ hoặc chưa được duyệt.");
    } finally {
      setLoading(false);
    }
  };

  // --- LUỒNG 1: ĐĂNG KÝ MỚI ---
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
      const { claimCode } = res.data;

      if (formData.paymentMethod === "vnpay") {
        // 👈 Gửi claimCode lên API thanh toán
        const payRes = await axios.post(`${API_BASE}/api/payment/create-shop-vnpay`, { claimCode });
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

  // --- LUỒNG 3: CẬP NHẬT ---
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const data = new FormData();
    Object.keys(formData).forEach(key => data.append(key, formData[key]));
    if (imageFile) data.append("image", imageFile);

    try {
      await axios.put(`${API_BASE}/api/shopkeeper/update/${claimCode}`, data);
      alert("Cập nhật thông tin thành công!");
    } catch (err) {
      setError("Lỗi khi cập nhật: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // GIAO DIỆN ĐĂNG KÝ THÀNH CÔNG (CHỜ DUYỆT)
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
        
        {/* HEADER */}
        <div className="text-center mb-8 relative">
          {view !== "login" && (
            <button onClick={() => setView("login")} className="absolute left-0 top-2 text-gray-500 hover:text-orange-500">
              <ArrowLeft size={24} />
            </button>
          )}
          <Store className="mx-auto text-orange-500 mb-2" size={48} />
          <h1 className="text-2xl font-bold text-gray-800">
            {view === "login" ? "Cổng Thông Tin Chủ Quán" : view === "register" ? "Đăng Ký Cửa Hàng Mới" : "Cập Nhật Cửa Hàng"}
          </h1>
        </div>

        {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-6 text-center">{error}</div>}

        {/* ================= GIAO DIỆN 1: NHẬP MÃ ================= */}
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
                onClick={() => handleVerify(claimCode)}
                disabled={loading || !claimCode}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? "Đang kiểm tra..." : "Vào Chỉnh Sửa"}
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

        {/* ================= GIAO DIỆN 2 & 3: FORM ĐĂNG KÝ / SỬA ================= */}
        {(view === "register" || view === "edit") && (
          <form onSubmit={view === "register" ? handleRegister : handleUpdate} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* CỘT TRÁI: NHẬP THÔNG TIN */}
              <div className="space-y-4">
                {view === "register" ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">Chọn địa điểm gần quán nhất</label>
                    <select value={formData.poiId} onChange={(e) => setFormData({...formData, poiId: e.target.value})} className="w-full border p-3 rounded-lg bg-white">
                      {pois.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                    <p className="text-orange-800 text-sm font-medium">Mã quán: <b>{claimCode}</b></p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Tên cửa hàng</label>
                  <input required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border p-3 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Mô tả</label>
                  <textarea rows="2" value={formData.descriptionVi} onChange={(e) => setFormData({...formData, descriptionVi: e.target.value})} className="w-full border p-3 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Giờ mở cửa</label>
                    <input value={formData.openingHours} onChange={(e) => setFormData({...formData, openingHours: e.target.value})} placeholder="08:00 - 21:00" className="w-full border p-3 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">SĐT</label>
                    <input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} placeholder="0905..." className="w-full border p-3 rounded-lg" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                    <ImageIcon size={16} /> Ảnh quán (Bỏ trống nếu giữ ảnh cũ)
                  </label>
                  <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} className="w-full border p-2 rounded-lg text-sm" />
                </div>

                {view === "register" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Hình thức thanh toán</label>
                    <select value={formData.paymentMethod} onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})} className="w-full border p-3 rounded-lg bg-orange-50 font-bold text-orange-700">
                      <option value="vnpay">Chuyển khoản VNPAY (Duyệt tự động)</option>
                      <option value="cash">Tiền mặt tại quầy (Chờ Admin duyệt)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* CỘT PHẢI: CHỌN VỊ TRÍ (Chỉ hiện khi Đăng ký) */}
              {view === "register" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Chọn vị trí quán trên bản đồ (Click vào bản đồ)</label>
                  <div className="h-[300px] w-full rounded-xl overflow-hidden border z-0">
                    <MapContainer center={[position.lat, position.lng]} zoom={16} style={{ height: "100%", width: "100%" }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <LocationMarker position={position} setPosition={setPosition} />
                    </MapContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Tọa độ: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}</p>
                </div>
              )}
            </div>

            <button disabled={loading} type="submit" className={`w-full text-white font-bold py-3 rounded-lg mt-4 transition ${view === "register" ? "bg-orange-500 hover:bg-orange-600" : "bg-blue-600 hover:bg-blue-700"}`}>
              {loading ? "Đang xử lý..." : view === "register" ? "Đăng Ký & Thanh Toán" : "Lưu Thay Đổi"}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}