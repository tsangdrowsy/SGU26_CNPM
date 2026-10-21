import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = ""; // Đổi thành "" nếu bạn đã build chung với backend

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post(`${API_BASE}/api/admin/login`, { username, password });
      if (res.data.success) {
        // Lưu trạng thái đăng nhập vào localStorage
        localStorage.setItem("admin_token", "true");
        localStorage.setItem("admin_name", res.data.adminName);
        navigate("/admin");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Lỗi kết nối tới Server");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">Admin Login</h2>
        <p className="text-center text-gray-500 mb-6">Vui lòng đăng nhập để tiếp tục</p>
        
        {error && <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-4 text-sm text-center">{error}</div>}
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tài khoản</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            className="w-full border p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" 
            placeholder="username"
            required 
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            className="w-full border p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" 
            placeholder="password"
            required 
          />
        </div>
        
        <button type="submit" className="w-full bg-orange-500 text-white font-bold py-3 rounded-lg hover:bg-orange-600 transition">
          Đăng nhập
        </button>
      </form>
    </div>
  );
}