import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import ClerkPage from "./pages/ClerkPage";
import AdminPage from "./pages/AdminPage";
import AdminLogin from "./pages/AdminLogin";
import ShopkeeperPage from "./pages/ShopkeeperPage";

const ProtectedRoute = () => {
  const isAuthenticated = localStorage.getItem("admin_token");
   console.log("Check auth:", isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/admin/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
        {/* Thanh điều hướng nhỏ xíu ở trên cùng để test cho dễ */}
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex gap-6 shadow-sm">
          <span className="font-bold text-orange-500">GuideFriends Portal</span>
         
        </nav>

        <Routes>
          {/* Route cho Shopkeeper */}
          <Route path="/shopkeeper" element={<ShopkeeperPage />} /> 
          {/* Nếu vào trang chủ, tự động chuyển hướng sang Clerk */}
          <Route path="/" element={<Navigate to="/clerk" replace />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          
          {/* Domain cho Clerk */}
          <Route path="/clerk" element={<ClerkPage />} />
          
          {/* Route cho Admin */}
          <Route element={<ProtectedRoute />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;