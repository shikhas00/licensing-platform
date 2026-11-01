import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"operator" | "officer">("operator");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;

    login(userId.trim(), role);

    // Redirect based on role
    if (role === "operator") {
      navigate("/operator/applications");
    } else {
      navigate("/officer/queue");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
          Licensing Platform
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          This is a demo with mocked authentication. Enter any user ID and select your role.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="userId"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              User ID
            </label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter your user ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("operator")}
                className={`p-4 rounded-lg border-2 text-center transition-colors ${
                  role === "operator"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">Operator</div>
                <div className="text-xs text-gray-500 mt-1">
                  Submit & manage applications
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRole("officer")}
                className={`p-4 rounded-lg border-2 text-center transition-colors ${
                  role === "officer"
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">Officer</div>
                <div className="text-xs text-gray-500 mt-1">
                  Review & approve applications
                </div>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
