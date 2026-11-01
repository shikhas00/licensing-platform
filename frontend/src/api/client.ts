import axios from "axios";
import type {
  Application,
  ApplicationCreate,
  ApplicationDetail,
  ApplicationListItem,
  ApplicationUpdate,
  Comment,
  CommentCreate,
  Document,
  FormSection,
  StatusUpdate,
  User,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth headers to all requests
export function setAuthHeaders(user: User) {
  api.defaults.headers.common["X-User-ID"] = user.userId;
  api.defaults.headers.common["X-User-Role"] = user.role;
}

// Applications API

export async function getApplications(): Promise<ApplicationListItem[]> {
  const response = await api.get<ApplicationListItem[]>("/applications/");
  return response.data;
}

export async function getApplication(id: number): Promise<ApplicationDetail> {
  const response = await api.get<ApplicationDetail>(`/applications/${id}`);
  return response.data;
}

export async function createApplication(data: ApplicationCreate): Promise<Application> {
  const response = await api.post<Application>("/applications/", data);
  return response.data;
}

export async function updateApplication(id: number, data: ApplicationUpdate): Promise<Application> {
  const response = await api.put<Application>(`/applications/${id}`, data);
  return response.data;
}

export async function updateApplicationStatus(id: number, data: StatusUpdate): Promise<Application> {
  const response = await api.patch<Application>(`/applications/${id}/status`, data);
  return response.data;
}

export async function submitApplication(id: number): Promise<Application> {
  const response = await api.post<Application>(`/applications/${id}/submit`);
  return response.data;
}

// Documents API

export async function getDocuments(applicationId: number, currentOnly = true): Promise<Document[]> {
  const response = await api.get<Document[]>(`/applications/${applicationId}/documents/`, {
    params: { current_only: currentOnly },
  });
  return response.data;
}

export async function getDocument(applicationId: number, documentId: number): Promise<Document> {
  const response = await api.get<Document>(`/applications/${applicationId}/documents/${documentId}`);
  return response.data;
}

export async function uploadDocument(
  applicationId: number,
  file: File,
  section: FormSection,
  supersedesId?: number
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("section", section);
  if (supersedesId) {
    formData.append("supersedes_id", supersedesId.toString());
  }

  const response = await api.post<Document>(
    `/applications/${applicationId}/documents/`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
}

export async function deleteDocument(applicationId: number, documentId: number): Promise<void> {
  await api.delete(`/applications/${applicationId}/documents/${documentId}`);
}

export async function getDocumentHistory(
  applicationId: number,
  documentId: number
): Promise<Document[]> {
  const response = await api.get<Document[]>(
    `/applications/${applicationId}/documents/${documentId}/history`
  );
  return response.data;
}

export async function downloadDocument(
  applicationId: number,
  documentId: number,
  filename: string
): Promise<void> {
  const response = await api.get(
    `/applications/${applicationId}/documents/${documentId}/download`,
    { responseType: "blob" }
  );

  // Create blob URL and trigger download
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Comments API

export async function getComments(
  applicationId: number,
  unresolvedOnly = false
): Promise<Comment[]> {
  const response = await api.get<Comment[]>(`/applications/${applicationId}/comments/`, {
    params: { unresolved_only: unresolvedOnly },
  });
  return response.data;
}

export async function createComment(
  applicationId: number,
  data: CommentCreate
): Promise<Comment> {
  const response = await api.post<Comment>(`/applications/${applicationId}/comments/`, data);
  return response.data;
}

export async function resolveComment(
  applicationId: number,
  commentId: number,
  isResolved = true
): Promise<Comment> {
  const response = await api.patch<Comment>(
    `/applications/${applicationId}/comments/${commentId}/resolve`,
    { is_resolved: isResolved }
  );
  return response.data;
}

// Export the api instance for direct use if needed
export default api;
