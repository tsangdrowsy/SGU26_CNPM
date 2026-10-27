import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Store, Image as ImageIcon, ArrowLeft, X, PlusCircle } from "lucide-react";

const API_BASE = "http://localhost:3000";

export default function ShopkeeperEditPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pois, setPois] = useState([]);

  const [formData, setFormData] = useState({
    name: "", descriptionVi: "", openingHours: "", phone: "", poiId: ""
  });
  const [startHour, setStartHour] = useState("08");
  const [endHour, setEndHour] = useState("21");
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  
  const [existingImages, setExistingImages] = useState([]);
  const [newImageFiles, setNewImageFiles] = useState([]);

  const getImageUrl = (img) => {
    if (!img) return "https://via.placeholder.com/400x200?text=No+Image";
    return img.startsWith("http") ? img : `${API_BASE}${img}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const poisRes = await axios.get(`${API_BASE}/api/pois?t=${Date.now()}`);
        setPois(poisRes.data.pois);

        const res = await axios.get(`${API_BASE}/api/shopkeeper/verify/${code.trim()}?t=${Date.now()}`);
        const shop = res.data.shop;
        
        let pStart = "08", pEnd = "21";
        if (shop.OpeningHours && shop.OpeningHours.includes(" - ")) {
          const parts = shop.OpeningHours.split(" - ");
          pStart = parts[0].split(":")[0];
          pEnd = parts[1].split(":")[0];
        }
        setStartHour(pStart);
        setEndHour(pEnd);

        setFormData({
          name: shop.Name,
          descriptionVi: shop.DescriptionVi || "",
          openingHours: shop.OpeningHours || "08:00 - 21:00",
          phone: shop.Phone || "",
          poiId: shop.PoiId || (poisRes.data.pois.length > 0 ? poisRes.data.pois[0].id : "")
        });

        let imgs = [];
        try {
          imgs = JSON.parse(shop.ImageUrl || "[]");
          if (!Array.isArray(imgs)) imgs = [shop.ImageUrl];
        } catch (e) {
          imgs = shop.ImageUrl ? [shop.ImageUrl] : [];
        }
        setExistingImages(imgs);
        
      } catch (err) {
        setError(err.response?.data?.error || "Mã không hợp lệ hoặc không tìm thấy quán.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [code]);

  const removeExistingImage = (index) => {
    const updated = [...existingImages];
    updated.splice(index, 1);
    setExistingImages(updated);
  };

  const removeNewImage = (index) => {
    const updated = [...newImageFiles];
    updated.splice(index, 1);
    setNewImageFiles(updated);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const data = new FormData();
    Object.keys(formData).forEach(key => data.append(key, formData[key]));
    data.append("keptImages", JSON.stringify(existingImages));

    if (newImageFiles && newImageFiles.length > 0) {
      for (let i = 0; i < newImageFiles.length; i++) {
        data.append("images", newImageFiles[i]);
      }
    }

    try {
      await axios.put(`${API_BASE}/api/shopkeeper/update/${code.trim()}`, data);
      alert("Cập nhật thông tin thành công!");
    } catch (err) {
      setError("Lỗi khi cập nhật: " + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Đang tải dữ liệu...</div>;
  if (error && !formData.name) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => navigate("/shopkeeper")} className="text-blue-500 hover:underline">Quay lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
        <div className="text-center mb-8 relative">
          <button onClick={() => navigate("/shopkeeper")} className="absolute left-0 top-2 text-gray-500 hover:text-orange-500">
            <ArrowLeft size={24} />
          </button>
          <Store className="mx-auto text-blue-500 mb-2" size={48} />
          <h1 className="text-2xl font-bold text-gray-800">Cập Nhật Cửa Hàng</h1>
          <p className="text-gray-500 mt-1">Mã quán: <span className="font-mono font-bold text-orange-500">{code}</span></p>
        </div>

        {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-6 text-center">{error}</div>}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Thuộc địa điểm (POI)</label>
            <select 
              value={formData.poiId} 
              onChange={(e) => setFormData({...formData, poiId: e.target.value})} 
              className="w-full border p-3 rounded-lg bg-white"
            >
              {pois.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tên cửa hàng</label>
            <input required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border p-3 rounded-lg" />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Mô tả</label>
            <textarea rows="3" value={formData.descriptionVi} onChange={(e) => setFormData({...formData, descriptionVi: e.target.value})} className="w-full border p-3 rounded-lg" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Giờ mở cửa</label>
              <div className="flex items-center gap-2">
                <select 
                  value={startHour} 
                  onChange={(e) => {
                    setStartHour(e.target.value);
                    setFormData({...formData, openingHours: `${e.target.value}:00 - ${endHour}:00`});
                  }} 
                  className="border p-3 rounded-lg bg-white w-full"
                >
                  {hours.map(h => <option key={`start-${h}`} value={h}>{h}:00</option>)}
                </select>
                <span className="text-gray-500 font-bold">đến</span>
                <select 
                  value={endHour} 
                  onChange={(e) => {
                    setEndHour(e.target.value);
                    setFormData({...formData, openingHours: `${startHour}:00 - ${e.target.value}:00`});
                  }} 
                  className="border p-3 rounded-lg bg-white w-full"
                >
                  {hours.map(h => <option key={`end-${h}`} value={h}>{h}:00</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Số điện thoại</label>
              <input 
                value={formData.phone} 
                onChange={(e) => {
                  const onlyNums = e.target.value.replace(/\D/g, '');
                  setFormData({...formData, phone: onlyNums});
                }} 
                placeholder="0905..." 
                className="w-full border p-3 rounded-lg" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <ImageIcon size={16} /> Hình ảnh quán
            </label>
            <div className="grid grid-cols-3 gap-3">
              {existingImages.map((img, idx) => (
                <div key={`old-${idx}`} className="relative group aspect-square">
                  <img src={getImageUrl(img)} alt="Shop" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                  <button type="button" onClick={() => removeExistingImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-md">
                    <X size={14} />
                  </button>
                </div>
              ))}

              {newImageFiles.map((file, idx) => (
                <div key={`new-${idx}`} className="relative group aspect-square">
                  <img src={URL.createObjectURL(file)} alt="New" className="w-full h-full object-cover rounded-lg border-2 border-orange-400" />
                  <button type="button" onClick={() => removeNewImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-md">
                    <X size={14} />
                  </button>
                </div>
              ))}

              <label className="border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition aspect-square">
                <PlusCircle className="text-gray-400 mb-1" size={24} />
                <span className="text-xs text-gray-500">Thêm ảnh</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setNewImageFiles([...newImageFiles, ...Array.from(e.target.files)])} />
              </label>
            </div>
          </div>

          <button disabled={saving} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition mt-4">
            {saving ? "Đang lưu..." : "Lưu Thay Đổi"}
          </button>
        </form>
      </div>
    </div>
  );
}