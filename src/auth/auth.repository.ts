import { Injectable } from '@nestjs/common';
import { Driver } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateDriverData {
  workId: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { email } });
  }

  findById(id: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { id } });
  }

  create(data: CreateDriverData): Promise<Driver> {
    return this.prisma.driver.create({ data });
  }
}
