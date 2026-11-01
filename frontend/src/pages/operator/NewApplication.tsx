import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createApplication, submitApplication } from "../../api/client";
import type { ApplicationCreate } from "../../types";

export function NewApplicationPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<ApplicationCreate>({
    business_name: "",
    business_type: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Clean form data - remove empty strings for optional fields
      const cleanedData = Object.fromEntries(
        Object.entries(formData).filter(([_, v]) => v !== "")
      ) as ApplicationCreate;
      const application = await createApplication(cleanedData);
      // Immediately submit so officers can see the application
      await submitApplication(application.id);
      navigate(`/operator/applications/${application.id}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: unknown } } };
      const detail = error.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (Array.isArray(detail) && detail.length > 0) {
        // Pydantic v2 validation errors: [{type, loc, msg, input, ctx}, ...]
        const messages = detail.map((e) => {
          if (typeof e === "string") return e;
          if (e && typeof e === "object" && "msg" in e) return String(e.msg);
          return "Validation error";
        });
        setError(messages.join(", "));
      } else {
        setError("Failed to create application");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        New License Application
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Information */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Business Information
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="business_name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Business Name *
              </label>
              <input
                type="text"
                id="business_name"
                name="business_name"
                value={formData.business_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="business_type"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Business Type
              </label>
              <select
                id="business_type"
                name="business_type"
                value={formData.business_type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select type...</option>
                <option value="restaurant">Restaurant</option>
                <option value="retail">Retail Store</option>
                <option value="bar">Bar / Nightclub</option>
                <option value="hotel">Hotel / Lodging</option>
                <option value="food_truck">Food Truck</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </section>

        {/* Contact Information */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Contact Information
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="contact_name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Contact Name
              </label>
              <input
                type="text"
                id="contact_name"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="contact_email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="contact_email"
                  name="contact_email"
                  value={formData.contact_email}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="contact_phone"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Phone
                </label>
                <input
                  type="tel"
                  id="contact_phone"
                  name="contact_phone"
                  value={formData.contact_phone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Address</h2>

          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Business Address
            </label>
            <textarea
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </section>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate("/operator/applications")}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Application"}
          </button>
        </div>
      </form>
    </div>
  );
}
