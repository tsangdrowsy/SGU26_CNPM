import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const API_BASE = "";

export default function ClerkPage() {
  const [tokenData, setTokenData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setTokenData(null);
    try {
      const res = await axios.post(`${API_BASE}/api/clerk/generate-token`, {
        username: "clerk01",
      });
      setTokenData(res.data);
    } catch (err) {
      alert("Lỗi khi tạo token: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center pt-10">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-gray-100 relative">
        
      

        <div className="text-center mt-4">
          <h2 className="text-2xl font-bold mb-2">Tạo Mã Mở Khóa</h2>
          <p className="text-gray-500 mb-8 text-sm">Cung cấp mã này cho khách hàng sau khi thanh toán vé.</p>
          
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition disabled:opacity-50 text-lg shadow-lg shadow-orange-500/30"
          >
            {loading ? "Đang tạo..." : "Tạo Mã 24H"}
          </button>
        </div>

        {tokenData && (
          <div className="mt-8 pt-8 border-t border-dashed border-gray-200 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
              <CheckCircle2 size={20} />
              <span className="font-semibold">Tạo thành công</span>
            </div>
            
            {/* Mã 6 ký tự to rõ */}
            <div className="bg-gray-50 border-2 border-orange-200 rounded-2xl p-6 mb-4">
              <p className="text-5xl font-mono font-bold tracking-widest text-orange-600 select-all">
                {tokenData.token}
              </p>
            </div>
            
            <p className="text-xs text-gray-400">
              Hết hạn lúc: {new Date(tokenData.expiresAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}