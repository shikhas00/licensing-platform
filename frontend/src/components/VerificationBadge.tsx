import { AIVerificationStatus } from "../types";

interface VerificationBadgeProps {
  status: AIVerificationStatus;
  message?: string | null;
}

function getStatusInfo(status: AIVerificationStatus): { color: string; icon: string; label: string } {
  switch (status) {
    case AIVerificationStatus.VERIFIED:
      return {
        color: "bg-green-100 text-green-700 border-green-200",
        icon: "\u2713",
        label: "Verified",
      };
    case AIVerificationStatus.FLAGGED:
      return {
        color: "bg-amber-100 text-amber-700 border-amber-200",
        icon: "\u26A0",
        label: "Flagged",
      };
    case AIVerificationStatus.FAILED:
      return {
        color: "bg-red-100 text-red-700 border-red-200",
        icon: "\u2717",
        label: "Failed",
      };
    case AIVerificationStatus.PENDING:
    default:
      return {
        color: "bg-gray-100 text-gray-600 border-gray-200",
        icon: "\u25CB",
        label: "Pending",
      };
  }
}

export function VerificationBadge({ status, message }: VerificationBadgeProps) {
  const { color, icon, label } = getStatusInfo(status);

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${color}`}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {message && status !== AIVerificationStatus.VERIFIED && (
        <span className="text-xs text-gray-500">{message}</span>
      )}
    </div>
  );
}
