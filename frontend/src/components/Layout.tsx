import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function Layout() {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleSwitchRole = () => {
    const newRole = user?.role === "operator" ? "officer" : "operator";
    switchRole();
    // Navigate to the appropriate home page for the new role
    navigate(newRole === "operator" ? "/operator/applications" : "/officer/queue");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/" className="text-xl font-bold text-gray-900">
                Licensing Platform
              </Link>

              {user && (
                <nav className="flex items-center gap-4">
                  {user.role === "operator" ? (
                    <>
                      <Link
                        to="/operator/applications"
                        className="text-gray-600 hover:text-gray-900"
                      >
                        My Applications
                      </Link>
                      <Link
                        to="/operator/applications/new"
                        className="text-gray-600 hover:text-gray-900"
                      >
                        New Application
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/officer/queue"
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Review Queue
                      </Link>
                    </>
                  )}
                </nav>
              )}
            </div>

            {user && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {user.userId}{" "}
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      user.role === "officer"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </span>
                <button
                  onClick={handleSwitchRole}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Switch to {user.role === "operator" ? "Officer" : "Operator"}
                </button>
                <button
                  onClick={handleLogout}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
