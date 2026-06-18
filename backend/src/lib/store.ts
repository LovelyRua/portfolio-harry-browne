export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
};

export type StoredData = {
  payload: unknown;
  updatedAt: Date;
};

export interface DataStore {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  createUser(email: string, passwordHash: string): Promise<StoredUser>;
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

  async createUser(email: string, passwordHash: string) {
    if (this.users.has(email)) throw new Error('EMAIL_EXISTS');
    const user = { id: crypto.randomUUID(), email, passwordHash };
    this.users.set(email, user);
    return user;
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
