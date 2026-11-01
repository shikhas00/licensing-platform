import {
  ApplicationStatus,
  OPERATOR_STATUS_LABELS,
  OFFICER_STATUS_LABELS,
} from "../types";
import { useAuth } from "../hooks/useAuth";

interface StatusBadgeProps {
  status: ApplicationStatus;
  size?: "sm" | "md" | "lg";
}

// Color mapping for different statuses
function getStatusColor(status: ApplicationStatus): string {
  switch (status) {
    case ApplicationStatus.APPROVED:
      return "bg-green-100 text-green-800 border-green-200";
    case ApplicationStatus.REJECTED:
      return "bg-red-100 text-red-800 border-red-200";
    case ApplicationStatus.PENDING_PRE_SITE_RESUBMISSION:
    case ApplicationStatus.PENDING_POST_SITE_RESUBMISSION:
      return "bg-amber-100 text-amber-800 border-amber-200";
    case ApplicationStatus.PRE_SITE_RESUBMITTED:
    case ApplicationStatus.POST_SITE_CLARIFICATION_RESUBMITTED:
      return "bg-blue-100 text-blue-800 border-blue-200";
    case ApplicationStatus.UNDER_REVIEW:
    case ApplicationStatus.PENDING_APPROVAL:
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const { user } = useAuth();
  const labels = user?.role === "officer" ? OFFICER_STATUS_LABELS : OPERATOR_STATUS_LABELS;
  const label = labels[status];
  const colorClass = getStatusColor(status);

  const sizeClass = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${colorClass} ${sizeClass}`}
    >
      {label}
    </span>
  );
}
