import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/Login";
import {
  OperatorApplicationList,
  OperatorApplicationDetail,
  NewApplicationPage,
} from "./pages/operator";
import {
  OfficerReviewQueue,
  OfficerApplicationReview,
} from "./pages/officer";

// Protected route wrapper
function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: ("operator" | "officer")[];
}) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate home
    return <Navigate to={user.role === "operator" ? "/operator/applications" : "/officer/queue"} replace />;
  }

  return <>{children}</>;
}

// Home redirect based on role
function HomeRedirect() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "operator") {
    return <Navigate to="/operator/applications" replace />;
  }

  return <Navigate to="/officer/queue" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Home redirect */}
      <Route path="/" element={<HomeRedirect />} />

      {/* Protected routes with layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Operator routes */}
        <Route
          path="/operator/applications"
          element={
            <ProtectedRoute allowedRoles={["operator"]}>
              <OperatorApplicationList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operator/applications/new"
          element={
            <ProtectedRoute allowedRoles={["operator"]}>
              <NewApplicationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operator/applications/:id"
          element={
            <ProtectedRoute allowedRoles={["operator"]}>
              <OperatorApplicationDetail />
            </ProtectedRoute>
          }
        />

        {/* Officer routes */}
        <Route
          path="/officer/queue"
          element={
            <ProtectedRoute allowedRoles={["officer"]}>
              <OfficerReviewQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/officer/applications/:id"
          element={
            <ProtectedRoute allowedRoles={["officer"]}>
              <OfficerApplicationReview />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
