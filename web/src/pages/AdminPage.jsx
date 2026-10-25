import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { PlusCircle, Image as ImageIcon, MapPin, Edit, LogOut } from "lucide-react";

const API_BASE = "http://localhost:3000";

export default function AdminPage() {
    const navigate = useNavigate();
    const adminName = localStorage.getItem("admin_name") || "Admin";

    // --- KHAI BÁO STATE ---
    // 👈 Sửa activeTokens thành activeUsers
    const [stats, setStats] = useState({ totalTokens: 0, activeUsers: 0, totalPois: 0 });
    const [tokens, setTokens] = useState([]);
    const [pois, setPois] = useState([]);
    const [allShops, setAllShops] = useState([]);
    const [pendingShops, setPendingShops] = useState([]);
    
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    // State cho form POI
    const [formData, setFormData] = useState({
        name: "", shortDescriptionVi: "", fullDescriptionVi: "",
        latitude: "", longitude: "", radiusMeters: 20,
    });
    const [imageFile, setImageFile] = useState(null);

    // --- HÀM TẢI DỮ LIỆU ---
    const loadData = async () => {
        try {
            const [statsRes, tokensRes, poisRes, allShopsRes, pendingShopsRes] = await Promise.all([
                axios.get(`${API_BASE}/api/admin/stats`),
                axios.get(`${API_BASE}/api/admin/tokens`),
                axios.get(`${API_BASE}/api/pois`),
                axios.get(`${API_BASE}/api/admin/shopkeepers`).catch(() => ({ data: { shops: [] } })),
                axios.get(`${API_BASE}/api/admin/shopkeeper/pending`).catch(() => ({ data: { shops: [] } }))
            ]);

            if (statsRes.data) setStats(statsRes.data);
            if (tokensRes.data?.tokens) setTokens(tokensRes.data.tokens);
            if (poisRes.data?.pois) setPois(poisRes.data.pois);
            if (allShopsRes.data?.shops) setAllShops(allShopsRes.data.shops);
            if (pendingShopsRes.data?.shops) setPendingShops(pendingShopsRes.data.shops);
            
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu:", error);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // --- HÀM XỬ LÝ FORM VÀ SỰ KIỆN ---
    const handleLogout = () => {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_name");
        navigate("/admin/login");
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setFormData({ name: "", shortDescriptionVi: "", fullDescriptionVi: "", latitude: "", longitude: "", radiusMeters: 20 });
        setImageFile(null);
    };

    const handleEditClick = (poi) => {
        setEditingId(poi.id);
        setFormData({
            name: poi.name || "",
            shortDescriptionVi: poi.shortDescriptionVi || "",
            fullDescriptionVi: poi.fullDescriptionVi || "",
            latitude: poi.location?.latitude || "",
            longitude: poi.location?.longitude || "",
            radiusMeters: poi.radiusMeters || 20,
        });
        setImageFile(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const data = new FormData();
        Object.keys(formData).forEach(key => data.append(key, formData[key]));
        if (imageFile) data.append("image", imageFile);

        try {
            if (editingId) {
                await axios.put(`${API_BASE}/api/admin/pois/${editingId}`, data, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                alert("Cập nhật POI thành công!");
            } else {
                await axios.post(`${API_BASE}/api/admin/pois`, data, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                alert("Thêm POI thành công!");
            }
            handleCancelEdit();
            loadData();
        } catch (err) {
            alert("Lỗi: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // HÀM DUYỆT QUÁN
    const handleApproveShop = async (shop) => {
        const isVnpay = shop.Status === 'pending_vnpay';
        const confirmMsg = isVnpay 
            ? "Bạn đã kiểm tra sao kê và xác nhận quán này đã chuyển khoản VNPAY thành công?" 
            : "Xác nhận đã thu tiền mặt và duyệt quán này?";
            
        if(!window.confirm(confirmMsg)) return;
        
        try {
            const res = await axios.post(`${API_BASE}/api/admin/shopkeeper/approve/${shop.Id}`);
            alert(`Đã duyệt! Mã Claim Code của quán là: ${res.data.claimCode}`);
            loadData(); 
        } catch (err) {
            alert("Lỗi duyệt quán: " + err.message);
        }
    };

    // --- RENDER GIAO DIỆN ---
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
                <div className="flex items-center gap-4">
                    <span className="text-gray-500">Xin chào, <b>{adminName}</b></span>
                    <button onClick={handleLogout} className="flex items-center gap-2 bg-red-50 text-red-500 px-4 py-2 rounded-lg hover:bg-red-100 transition font-medium">
                        <LogOut size={16} /> Đăng xuất
                    </button>
                </div>
            </div>

            {/* 1. Thẻ thống kê */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium">Tổng số Token đã tạo</p>
                    <p className="text-4xl font-bold text-blue-600 mt-2">{stats.totalTokens || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium">Người dùng đang hoạt động</p>
                    {/* 👈 Sửa hiển thị thành activeUsers */}
                    <p className="text-4xl font-bold text-green-600 mt-2">{stats.activeUsers || 0}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500 font-medium">Tổng số Địa điểm (POI)</p>
                    <p className="text-4xl font-bold text-orange-500 mt-2">{stats.totalPois || 0}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 2. Bảng Token */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold mb-4">Token đang hoạt động</h2>
                    <div className="overflow-y-auto max-h-[400px]">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="sticky top-0 bg-gray-50">
                                <tr>
                                    <th className="p-3 border-b font-semibold text-gray-600">Mã Token</th>
                                    <th className="p-3 border-b font-semibold text-gray-600">Nguồn</th>
                                    <th className="p-3 border-b font-semibold text-gray-600">Hết hạn</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tokens.map((t, i) => (
                                    <tr key={i} className="hover:bg-gray-50 border-b last:border-0">
                                        <td className="p-3 font-mono font-bold text-orange-600">{t.Token || "N/A"}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${t.Source === 'vnpay' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {t.Source === 'vnpay' ? 'VNPAY' : 'Clerk'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-gray-500">
                                            {t.ExpiresAt ? new Date(t.ExpiresAt).toLocaleString() : "N/A"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {tokens.length === 0 && <p className="text-gray-400 text-center mt-4">Chưa có token nào.</p>}
                    </div>
                </div>

                {/* 3. Form Thêm/Sửa POI */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            {editingId ? <Edit className="text-blue-500" /> : <PlusCircle className="text-orange-500" />}
                            {editingId ? "Chỉnh sửa Địa điểm" : "Thêm Địa điểm mới"}
                        </h2>
                        {editingId && (
                            <button type="button" onClick={handleCancelEdit} className="text-sm text-red-500 hover:underline">
                                Hủy
                            </button>
                        )}
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tên địa điểm</label>
                            <input required name="name" value={formData.name} onChange={handleInputChange} className="w-full border p-2 rounded-lg" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Vĩ độ (Lat)</label>
                                <input required type="number" step="any" name="latitude" value={formData.latitude} onChange={handleInputChange} className="w-full border p-2 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kinh độ (Lng)</label>
                                <input required type="number" step="any" name="longitude" value={formData.longitude} onChange={handleInputChange} className="w-full border p-2 rounded-lg" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả ngắn (Tiếng Việt)</label>
                            <textarea required name="shortDescriptionVi" value={formData.shortDescriptionVi} onChange={handleInputChange} rows="2" className="w-full border p-2 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả đầy đủ</label>
                            <textarea required name="fullDescriptionVi" value={formData.fullDescriptionVi} onChange={handleInputChange} rows="3" className="w-full border p-2 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                <ImageIcon size={16} /> Ảnh đại diện
                            </label>
                            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} className="w-full border p-2 rounded-lg text-sm" />
                        </div>
                        <button disabled={loading} type="submit" className={`w-full text-white font-bold py-3 rounded-lg transition ${editingId ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'}`}>
                            {loading ? "Đang lưu..." : editingId ? "Cập nhật Địa Điểm" : "Lưu Địa Điểm Mới"}
                        </button>
                    </form>
                </div>
            </div>

            {/* 4. Duyệt Cửa hàng mới */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4">Duyệt Cửa hàng mới</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 border-b">Tên quán</th>
                                <th className="p-3 border-b">SĐT</th>
                                <th className="p-3 border-b">Hình thức</th>
                                <th className="p-3 border-b">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingShops.map(shop => (
                                <tr key={shop.Id}>
                                    <td className="p-3 font-medium">{shop.Name}</td>
                                    <td className="p-3">{shop.Phone}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${shop.Status === 'pending_vnpay' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                            {shop.Status === 'pending_vnpay' ? 'VNPAY (Chờ đối soát)' : 'Tiền mặt'}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <button 
                                            onClick={() => handleApproveShop(shop)} 
                                            className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition font-medium"
                                        >
                                            Duyệt
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {pendingShops.length === 0 && <p className="text-gray-400 mt-4 text-center">Không có cửa hàng nào đang chờ duyệt.</p>}
                </div>
            </div>

            {/* 5. Danh sách POI */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <MapPin className="text-blue-500" /> Danh sách Địa điểm hiện có ({pois.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pois.map((poi) => (
                        <div key={poi.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition">
                            <div className="h-40 bg-gray-100 relative">
                                {poi.imageUrl ? (
                                    <img src={`${API_BASE}${poi.imageUrl}`} alt={poi.name} className="w-full h-full object-cover" onError={(e) => { e.target.src = "https://via.placeholder.com/400x200?text=No+Image"; }} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400"><ImageIcon size={32} /></div>
                                )}
                                <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">{poi.id}</span>
                            </div>
                            <div className="p-4 flex flex-col justify-between h-[calc(100%-10rem)]">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 line-clamp-1">{poi.name}</h3>
                                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{poi.shortDescriptionVi}</p>
                                </div>
                                <div className="mt-3 flex items-center justify-between">
                                    <div className="text-xs text-gray-400 flex items-center gap-1">
                                        <MapPin size={12} /> {poi.location?.latitude}, {poi.location?.longitude}
                                    </div>
                                    <button onClick={() => handleEditClick(poi)} className="text-blue-500 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1">
                                        <Edit size={14} /> Sửa
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 6. Tất cả Cửa hàng */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-8">
                <h2 className="text-xl font-bold mb-4">Tất cả Cửa hàng đã đăng ký</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 border-b">Tên quán</th>
                                <th className="p-3 border-b">Thuộc POI</th>
                                <th className="p-3 border-b">Mã Claim Code</th>
                                <th className="p-3 border-b">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allShops.map(shop => (
                                <tr key={shop.Id} className="hover:bg-gray-50">
                                    <td className="p-3 font-medium">{shop.Name}</td>
                                    <td className="p-3 text-gray-500">{shop.PoiId}</td>
                                    <td className="p-3 font-mono font-bold text-blue-600">{shop.ClaimCode || 'N/A'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            shop.Status === 'approved' ? 'bg-green-100 text-green-700' : 
                                            shop.Status === 'pending_vnpay' ? 'bg-blue-100 text-blue-700' : 
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {shop.Status === 'approved' ? 'Đã duyệt' : 
                                             shop.Status === 'pending_vnpay' ? 'Chờ VNPAY' : 'Chờ duyệt'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {allShops.length === 0 && <p className="text-center text-gray-500 py-4">Chưa có cửa hàng nào.</p>}
                </div>
            </div>
        </div>
    );
}