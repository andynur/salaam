export class ApiError extends Error {
  constructor(public status: number, message: string, public requestId?: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...options, credentials: "same-origin" }); }
  catch { throw new ApiError(0, "Tidak dapat terhubung. Periksa koneksi Anda."); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; requestId?: string } } | null;
    throw new ApiError(response.status, body?.error?.message ?? "Permintaan gagal. Silakan coba lagi.", body?.error?.requestId);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
