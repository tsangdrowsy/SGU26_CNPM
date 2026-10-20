import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import ClerkPage from "./pages/ClerkPage";
import AdminPage from "./pages/AdminPage";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
        {/* Thanh điều hướng nhỏ xíu ở trên cùng để test cho dễ */}
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex gap-6 shadow-sm">
          <span className="font-bold text-orange-500">GuideFriends Portal</span>
         
        </nav>

        <Routes>
          {/* Nếu vào trang chủ, tự động chuyển hướng sang Clerk */}
          <Route path="/" element={<Navigate to="/clerk" replace />} />
          
          {/* Domain cho Clerk */}
          <Route path="/clerk" element={<ClerkPage />} />
          
          {/* Domain cho Admin */}
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;