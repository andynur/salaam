export function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error("Password must be 12–128 characters");
  return Bun.password.hash(password, { algorithm: "argon2id", memoryCost: 19456, timeCost: 2 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || password.length > 128) return false;
  return Bun.password.verify(password, hash, "argon2id");
}
