export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  verificationHash: string | null;
  verificationExpiry: Date | null;
  passwordResetHash: string | null;
  passwordResetExpiry: Date | null;
  tokenVersion: number;
};

export type StoredData = {
  payload: unknown;
  updatedAt: Date;
};

export interface DataStore {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  createUser(email: string, passwordHash: string, verificationHash: string, verificationExpiry: Date): Promise<StoredUser>;
  setEmailVerification(userId: string, verificationHash: string, verificationExpiry: Date): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<number>;
  setPasswordReset(userId: string, resetHash: string, resetExpiry: Date): Promise<void>;
  getData(userId: string): Promise<StoredData | null>;
  saveData(userId: string, payload: unknown): Promise<StoredData>;
  close(): Promise<void>;
}

export class MemoryStore implements DataStore {
  private users = new Map<string, StoredUser>();
  private data = new Map<string, StoredData>();

  async findUserByEmail(email: string) {
    return this.users.get(email) ?? null;
  }

  async findUserById(id: string) {
    return Array.from(this.users.values()).find((candidate) => candidate.id === id) ?? null;
  }

  async createUser(email: string, passwordHash: string, verificationHash: string, verificationExpiry: Date) {
    if (this.users.has(email)) throw new Error('EMAIL_EXISTS');
    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash,
      emailVerifiedAt: null,
      verificationHash,
      verificationExpiry,
      passwordResetHash: null,
      passwordResetExpiry: null,
      tokenVersion: 0,
    };
    this.users.set(email, user);
    return user;
  }

  async setEmailVerification(userId: string, verificationHash: string, verificationExpiry: Date) {
    const user = Array.from(this.users.values()).find((candidate) => candidate.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.verificationHash = verificationHash;
    user.verificationExpiry = verificationExpiry;
  }

  async markEmailVerified(userId: string) {
    const user = Array.from(this.users.values()).find((candidate) => candidate.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.emailVerifiedAt = new Date();
    user.verificationHash = null;
    user.verificationExpiry = null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    const user = Array.from(this.users.values()).find((candidate) => candidate.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.passwordHash = passwordHash;
    user.tokenVersion += 1;
    user.passwordResetHash = null;
    user.passwordResetExpiry = null;
    return user.tokenVersion;
  }

  async setPasswordReset(userId: string, resetHash: string, resetExpiry: Date) {
    const user = Array.from(this.users.values()).find((candidate) => candidate.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.passwordResetHash = resetHash;
    user.passwordResetExpiry = resetExpiry;
  }

  async getData(userId: string) {
    return this.data.get(userId) ?? null;
  }

  async saveData(userId: string, payload: unknown) {
    const value = { payload, updatedAt: new Date() };
    this.data.set(userId, value);
    return value;
  }

  async close() {}
}
