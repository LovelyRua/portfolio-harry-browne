import { PrismaClient } from '../generated/prisma/client';
import { DataStore } from './store';

export class PrismaStore implements DataStore {
  private prisma = new PrismaClient();

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  async createUser(email: string, passwordHash: string) {
    return this.prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  async getData(userId: string) {
    return this.prisma.userData.findUnique({
      where: { userId },
      select: { payload: true, updatedAt: true },
    });
  }

  async saveData(userId: string, payload: unknown) {
    return this.prisma.userData.upsert({
      where: { userId },
      create: { userId, payload: payload as never },
      update: { payload: payload as never },
      select: { payload: true, updatedAt: true },
    });
  }

  async close() {
    await this.prisma.$disconnect();
  }
}
