import { PrismaClient } from '../generated/prisma/client';
import { DataStore } from './store';

export class PrismaStore implements DataStore {
  private prisma = new PrismaClient();

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
        verificationHash: true,
        verificationExpiry: true,
        tokenVersion: true,
      },
    });
  }

  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
        verificationHash: true,
        verificationExpiry: true,
        tokenVersion: true,
      },
    });
  }

  async createUser(email: string, passwordHash: string, verificationHash: string, verificationExpiry: Date) {
    return this.prisma.user.create({
      data: { email, passwordHash, verificationHash, verificationExpiry },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
        verificationHash: true,
        verificationExpiry: true,
        tokenVersion: true,
      },
    });
  }

  async setEmailVerification(userId: string, verificationHash: string, verificationExpiry: Date) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationHash, verificationExpiry },
    });
  }

  async markEmailVerified(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), verificationHash: null, verificationExpiry: null },
    });
  }

  async updatePassword(userId: string, passwordHash: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return user.tokenVersion;
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
