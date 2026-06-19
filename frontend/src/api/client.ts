import axios, { AxiosError } from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";

const TOKEN_KEY = "agora.token";
const CAMPAIGN_KEY = "agora-campaign";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

// Attach bearer token on every request.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Attach active campaign id on every request.
apiClient.interceptors.request.use((config) => {
  try {
    const campaignId = localStorage.getItem(CAMPAIGN_KEY);
    if (campaignId) {
      config.headers["X-Campaign-Id"] = campaignId;
    }
  } catch {
    /* ignore – localStorage may be unavailable */
  }
  return config;
});

// Normalize errors and handle expired sessions.
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { message?: string } }>) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }
    const message =
      error.response?.data?.error?.message ??
      error.message ??
      "Unexpected error";
    const wrapped = new Error(message) as Error & { status?: number };
    wrapped.status = status;
    return Promise.reject(wrapped);
  },
);

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
