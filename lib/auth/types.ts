export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
  expiresAt?: number;
  resendAvailableAt?: number;
};

export type VerifyOtpState = {
  status: "idle" | "error";
  message?: string;
};

export type AccountFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};
